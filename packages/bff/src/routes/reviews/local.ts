/** Local code review endpoint: accepts files and runs an AI review agent in a sandboxed temp directory. */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKAssistantMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { Hono } from "hono";
import { getOrgIdFromHeader } from "../../auth";
import { prisma } from "../../db";
import { getAuthUser, requireAuth } from "../../middleware/auth";
import { getOrgQuotaPool } from "../../middleware/organization";
import type { LocalReviewFile } from "./utils";
import { buildLocalReviewPrompt, parseLocalReviewResponse } from "./utils";

function buildClaudeAgentEnv(): Record<string, string> {
  // Claude Code "setup-token" produces a long-lived OAuth token (sk-ant-oat...).
  // The Claude Agent SDK / Claude Code runtime expects this in CLAUDE_CODE_OAUTH_TOKEN.
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      // If an OAuth token is provided, ensure we don't accidentally fall back to API key auth.
      if (oauthToken && key === "ANTHROPIC_API_KEY") {
        continue;
      }
      env[key] = value;
    }
  }

  if (oauthToken) {
    env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
  }

  return env;
}

const localRoutes = new Hono();

localRoutes.post("/reviews/local", requireAuth(), async (c) => {
  const user = getAuthUser(c);

  // Resolve organization: explicit header or fall back to user's personal org
  const orgId = getOrgIdFromHeader(c) || user.personalOrgId;
  if (!orgId) {
    return c.json(
      { error: "No organization found. Create an account at opendiff.dev first." },
      400
    );
  }

  // Verify user is a member of this org
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
    include: { organization: true },
  });
  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  // Check quota before running the review
  const quotaPool = await getOrgQuotaPool(orgId);
  if (quotaPool.total !== -1 && quotaPool.used > quotaPool.total) {
    return c.json(
      {
        error: "Token quota exceeded",
        used: quotaPool.used,
        limit: quotaPool.total,
      },
      403
    );
  }

  const body = await c.req.json();
  const {
    files,
    title,
    sensitivity = 50,
  } = body as {
    files?: LocalReviewFile[];
    title?: string;
    sensitivity?: number;
  };

  if (!files || !Array.isArray(files) || files.length === 0) {
    return c.json({ error: "files array is required" }, 400);
  }

  if (!title) {
    return c.json({ error: "title is required" }, 400);
  }

  // Write files to a temp directory so the agent can read them with tools
  const workingDir = mkdtempSync(join(tmpdir(), "opendiff-local-"));

  try {
    const realWorkingDir = realpathSync(workingDir);
    for (const file of files) {
      // Resolve to absolute path and verify it stays within the temp dir
      const filePath = resolve(realWorkingDir, file.filename);
      if (!filePath.startsWith(`${realWorkingDir}/`)) {
        rmSync(workingDir, { recursive: true, force: true });
        return c.json({ error: "Invalid filename" }, 400);
      }
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, file.content);
    }

    const prompt = buildLocalReviewPrompt(files, title, sensitivity);

    let result = "";
    let lastAssistantText = "";
    let totalTokens = 0;

    try {
      for await (const message of query({
        prompt,
        options: {
          cwd: workingDir,
          env: buildClaudeAgentEnv(),
          allowedTools: ["Read", "Glob", "Grep"],
          permissionMode: "default",
          maxTurns: 30,
          settingSources: ["user"],
        },
      })) {
        if (message.type === "assistant") {
          const assistantMsg = message as SDKAssistantMessage;
          const content = assistantMsg.message?.content ?? [];
          for (const block of content) {
            if (block.type === "text" && block.text) {
              lastAssistantText = block.text;
            }
          }
        }

        if (message.type === "result") {
          const resultMsg = message as SDKResultMessage;
          if (resultMsg.subtype === "success") {
            result = resultMsg.result || lastAssistantText || "";
            const usage = resultMsg.usage;
            if (usage) {
              totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
            }
          } else {
            throw new Error(resultMsg.errors?.join(", ") || "Review agent failed");
          }
        }
      }
    } catch (error) {
      // SDK stream cleanup bug workaround (same as review agent)
      if (
        (result || lastAssistantText) &&
        error instanceof TypeError &&
        String(error).includes("trim")
      ) {
        console.warn("Ignoring SDK stream cleanup error");
        if (!result) result = lastAssistantText;
      } else {
        console.error("Local review agent error:", error);
        return c.json({ error: "Review failed" }, 500);
      }
    }

    // Deduct tokens from org quota
    if (totalTokens > 0) {
      await prisma.organization.update({
        where: { id: orgId },
        data: { tokensUsedThisCycle: { increment: totalTokens } },
      });
    }

    try {
      const review = parseLocalReviewResponse(result);

      // Persist review + comments so they appear in dashboard stats
      const dbReview = await prisma.review.create({
        data: {
          organizationId: orgId,
          repositorySettingsId: null,
          pullNumber: 0,
          reviewType: "local",
          tokensUsed: totalTokens || null,
          summary: review.summary,
          summaryStatus: 1,
        },
      });

      if (review.issues.length > 0) {
        await prisma.reviewComment.createMany({
          data: review.issues.map((issue) => ({
            reviewId: dbReview.id,
            body: issue.message,
            path: issue.file || null,
            line: issue.line || null,
          })),
        });
      }

      return c.json(review);
    } catch (error) {
      console.error("Failed to parse local review response:", error);
      return c.json({ error: "Failed to parse review response" }, 500);
    }
  } finally {
    // Clean up temp directory
    rmSync(workingDir, { recursive: true, force: true });
  }
});

export { localRoutes };
