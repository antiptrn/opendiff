/**
 * Contrast's MCP server, so AI agents can do what the console does: browse reviewed pull requests
 * and the issues Contrast found, accept or reject fixes, and connect and configure repositories.
 *
 * It's served over Streamable HTTP at /mcp, statelessly, and signed in with a personal access
 * token (`Authorization: Bearer cpat_...`). Every tool calls the BFF's own API with that token, so
 * permissions and behaviour are exactly the API's; the token only reaches the routes it's allowed.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { z } from "zod";
import { findAccessToken, isAccessToken } from "./access-tokens";

type FetchApi = (request: Request) => Response | Promise<Response>;

interface ApiResult {
  ok: boolean;
  status: number;
  data: unknown;
}

/** A tool's answer: the API's JSON as text, marked as an error when the API refused */
function toolResult(result: ApiResult) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
    ...(result.ok ? {} : { isError: true }),
  };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function buildServer(
  callApi: (method: string, path: string, body?: unknown) => Promise<ApiResult>
) {
  const server = new McpServer({ name: "contrast", version: "1.0.0" });
  const readOnly = { readOnlyHint: true, openWorldHint: false };
  const repository = {
    owner: z.string().describe("The repository's owner on GitHub"),
    repo: z.string().describe("The repository's name"),
  };

  server.registerTool(
    "list_pull_requests",
    {
      title: "List pull requests",
      description:
        "Pull requests Contrast has reviewed, newest review first, with their GitHub state, labels, author and how many issues Contrast found. Also returns open/closed counts and the authors and repositories available to filter by.",
      inputSchema: {
        state: z.enum(["open", "closed", "all"]).optional().describe("Defaults to open"),
        authors: z.array(z.string()).optional().describe("GitHub usernames"),
        repos: z.array(z.string()).optional().describe('Repositories as "owner/name"'),
        query: z.string().optional().describe("Matches title, number, author or repository"),
        sort: z.enum(["reviewed", "newest", "oldest", "issues", "comments"]).optional(),
        page: z.number().int().min(1).optional(),
      },
      annotations: readOnly,
    },
    async ({ state, authors, repos, query, sort, page }) => {
      const params = new URLSearchParams({ page: String(page ?? 1) });
      if (state) params.set("state", state);
      if (authors?.length) params.set("author", authors.join(","));
      if (repos?.length) params.set("repos", repos.join(","));
      if (query) params.set("q", query);
      if (sort) params.set("sort", sort);
      return toolResult(await callApi("GET", `/api/reviews?${params}`));
    }
  );

  server.registerTool(
    "get_pull_request",
    {
      title: "Get a pull request",
      description:
        "One reviewed pull request by the id from list_pull_requests: its summary, the issues Contrast found (with file and line) and any suggested fixes with their ids and status.",
      inputSchema: { id: z.string().describe("The pull request's id from list_pull_requests") },
      annotations: readOnly,
    },
    async ({ id }) => toolResult(await callApi("GET", `/api/reviews/${encodeURIComponent(id)}`))
  );

  server.registerTool(
    "list_issues",
    {
      title: "List issues",
      description:
        "Issues Contrast found across all reviewed pull requests, newest first. The query matches the issue text, file path or repository.",
      inputSchema: {
        status: z
          .enum(["open", "closed"])
          .optional()
          .describe("Closed issues had their fix accepted or rejected; leave out for both"),
        query: z.string().optional(),
        page: z.number().int().min(1).optional(),
      },
      annotations: readOnly,
    },
    async ({ status, query, page }) => {
      const params = new URLSearchParams({ page: String(page ?? 1) });
      if (status) params.set("status", status);
      if (query) params.set("q", query);
      return toolResult(await callApi("GET", `/api/review-issues?${params}`));
    }
  );

  for (const decision of ["accept", "reject"] as const) {
    server.registerTool(
      `${decision}_fix`,
      {
        title: decision === "accept" ? "Accept a fix" : "Reject a fix",
        description:
          decision === "accept"
            ? "Accept a fix Contrast suggested: it's committed to the pull request's branch. Get the ids from get_pull_request."
            : "Reject a fix Contrast suggested, so it isn't applied. Get the ids from get_pull_request.",
        inputSchema: {
          pullRequestId: z.string().describe("The pull request's id"),
          fixId: z.string().describe("The fix's id"),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      },
      async ({ pullRequestId, fixId }) =>
        toolResult(
          await callApi(
            "POST",
            `/api/reviews/${encodeURIComponent(pullRequestId)}/fixes/${encodeURIComponent(fixId)}/${decision}`
          )
        )
    );
  }

  server.registerTool(
    "list_repositories",
    {
      title: "List connected repositories",
      description:
        "Repositories connected to Contrast in this organization, with whether reviews and auto-fix are on.",
      inputSchema: { query: z.string().optional().describe("Matches the repository name") },
      annotations: readOnly,
    },
    async ({ query }) => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      return toolResult(await callApi("GET", `/api/org/repos?${params}`));
    }
  );

  server.registerTool(
    "search_github_repositories",
    {
      title: "Search GitHub repositories",
      description:
        "Repositories on GitHub the signed-in user can access, to find one to connect. Needs a linked GitHub account.",
      inputSchema: { query: z.string().describe("Repository name or owner/name") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query }) =>
      toolResult(await callApi("GET", `/api/repos?q=${encodeURIComponent(query)}`))
  );

  server.registerTool(
    "get_repository_settings",
    {
      title: "Get repository settings",
      description:
        "A connected repository's review settings: reviews, approvals, auto-fix, sensitivity, custom review rules and the folders reviews and auto-fix include or ignore.",
      inputSchema: repository,
      annotations: readOnly,
    },
    async ({ owner, repo }) =>
      toolResult(
        await callApi(
          "GET",
          `/api/settings/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
        )
      )
  );

  const settingsFields = {
    reviewsEnabled: z.boolean().optional().describe("Review pull requests"),
    approveEnabled: z.boolean().optional().describe("Approve pull requests with no issues"),
    autofixEnabled: z.boolean().optional().describe("Suggest and apply fixes"),
    sensitivity: z.number().int().min(0).max(100).optional().describe("0 is lenient, 100 strict"),
    customReviewRules: z.string().optional().describe("Markdown rules reviews should follow"),
    reviewIncludedDirs: z.string().optional().describe("Paths to review, one per line"),
    reviewIgnoredDirs: z.string().optional().describe("Paths to skip, one per line"),
    autofixIncludedDirs: z.string().optional(),
    autofixIgnoredDirs: z.string().optional(),
  };

  server.registerTool(
    "update_repository_settings",
    {
      title: "Update repository settings",
      description:
        "Change a connected repository's review settings. Only the settings given change; the rest stay as they are.",
      inputSchema: { ...repository, ...settingsFields },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ owner, repo, reviewsEnabled, ...changes }) => {
      const path = `/api/settings/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
      const current = await callApi("GET", path);
      if (!current.ok) return toolResult(current);
      const settings = current.data as Record<string, unknown>;
      // The API sets every field it's sent (and "enabled" always), so send the current values too
      return toolResult(
        await callApi("PUT", path, {
          enabled: reviewsEnabled ?? settings.enabled,
          approveEnabled: changes.approveEnabled ?? settings.approveEnabled,
          autofixEnabled: changes.autofixEnabled ?? settings.autofixEnabled,
          sensitivity: changes.sensitivity ?? settings.sensitivity,
          customReviewRules: changes.customReviewRules ?? settings.customReviewRules,
          reviewIncludedDirs: changes.reviewIncludedDirs ?? settings.reviewIncludedDirs,
          reviewIgnoredDirs: changes.reviewIgnoredDirs ?? settings.reviewIgnoredDirs,
          autofixIncludedDirs: changes.autofixIncludedDirs ?? settings.autofixIncludedDirs,
          autofixIgnoredDirs: changes.autofixIgnoredDirs ?? settings.autofixIgnoredDirs,
        })
      );
    }
  );

  server.registerTool(
    "connect_repository",
    {
      title: "Connect a repository",
      description:
        "Connect a GitHub repository so Contrast reviews its pull requests. The Contrast GitHub App must be installed on it. Optionally reviews the pull requests already open, which uses review tokens.",
      inputSchema: {
        ...repository,
        ...settingsFields,
        reviewOpenPullRequests: z
          .boolean()
          .optional()
          .describe("Also review every open, non-draft pull request now"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ owner, repo, reviewsEnabled, reviewOpenPullRequests, ...settings }) => {
      const fullName = `${owner}/${repo}`.toLowerCase();
      const search = await callApi("GET", `/api/repos?q=${encodeURIComponent(repo)}`);
      if (!search.ok) return toolResult(search);
      const match = (search.data as Array<{ id: number; full_name: string }>).find(
        (candidate) => candidate.full_name.toLowerCase() === fullName
      );
      if (!match) {
        return toolError(
          `Couldn't find ${owner}/${repo} among the GitHub repositories you can access.`
        );
      }

      const path = `/api/settings/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
      const enabled = reviewsEnabled ?? true;
      const connected = await callApi("PUT", path, {
        enabled,
        githubRepoId: match.id,
        ...settings,
      });
      if (!connected.ok || !reviewOpenPullRequests || !enabled) return toolResult(connected);

      const backlog = await callApi("POST", `${path}/review-open-pulls`);
      return toolResult({
        ok: backlog.ok,
        status: backlog.status,
        data: { settings: connected.data, openPullRequestReviews: backlog.data },
      });
    }
  );

  server.registerTool(
    "disconnect_repository",
    {
      title: "Disconnect a repository",
      description:
        "Disconnect a repository: Contrast stops reviewing it and its settings are deleted. Confirm with the user first, then pass confirm: true.",
      inputSchema: {
        ...repository,
        confirm: z.literal(true).describe("Must be true; ask the user before disconnecting"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ owner, repo }) =>
      toolResult(
        await callApi(
          "DELETE",
          `/api/settings/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
        )
      )
  );

  server.registerTool(
    "review_open_pull_requests",
    {
      title: "Review open pull requests",
      description:
        "Queue a review of every open, non-draft pull request in a connected repository that has reviews on. Uses review tokens.",
      inputSchema: repository,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ owner, repo }) =>
      toolResult(
        await callApi(
          "POST",
          `/api/settings/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/review-open-pulls`
        )
      )
  );

  server.registerTool(
    "get_overview",
    {
      title: "Get an overview",
      description:
        "Totals for the organization: connected repositories, reviews done, issues found and issues fixed.",
      inputSchema: {},
      annotations: readOnly,
    },
    async () => toolResult(await callApi("GET", "/api/stats"))
  );

  server.registerTool(
    "get_usage",
    {
      title: "Get usage",
      description:
        "The plan and how many review tokens have been used this billing cycle, with what's left. Check before reviewing a backlog of pull requests.",
      inputSchema: {},
      annotations: readOnly,
    },
    async () => toolResult(await callApi("GET", "/api/stats/usage"))
  );

  server.registerTool(
    "update_pull_request",
    {
      title: "Update a pull request",
      description:
        "Set a reviewed pull request's labels or assignees on GitHub. The lists replace the current ones, so include any to keep.",
      inputSchema: {
        id: z.string().describe("The pull request's id from list_pull_requests"),
        labels: z.array(z.string()).optional().describe("Label names"),
        assignees: z.array(z.string()).optional().describe("GitHub usernames"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ id, labels, assignees }) => {
      if (!labels && !assignees) return toolError("Give labels, assignees or both.");
      return toolResult(
        await callApi("PATCH", `/api/reviews/${encodeURIComponent(id)}`, { labels, assignees })
      );
    }
  );

  server.registerTool(
    "list_notifications",
    {
      title: "List notifications",
      description:
        "Recent activity: reviews started and finished, fixes applied or failed, repositories added. Newest first, with how many are unread.",
      inputSchema: { page: z.number().int().min(1).optional() },
      annotations: readOnly,
    },
    async ({ page }) =>
      toolResult(await callApi("GET", `/api/notifications?page=${page ?? 1}`))
  );

  server.registerTool(
    "mark_notifications_read",
    {
      title: "Mark notifications read",
      description: "Mark one notification as read by its id, or all of them when no id is given.",
      inputSchema: { id: z.string().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ id }) =>
      toolResult(
        await callApi(
          "POST",
          id ? `/api/notifications/${encodeURIComponent(id)}/read` : "/api/notifications/read-all"
        )
      )
  );

  server.registerTool(
    "get_review_rules",
    {
      title: "Get your review rules",
      description:
        "Your own review rules, which apply to every repository (each repository can add its own in its settings).",
      inputSchema: {},
      annotations: readOnly,
    },
    async () => toolResult(await callApi("GET", "/api/settings/review-rules"))
  );

  server.registerTool(
    "update_review_rules",
    {
      title: "Update your review rules",
      description:
        "Replace your review rules, which apply to every repository. Send the full text; an empty string clears them.",
      inputSchema: { rules: z.string().describe("Markdown rules, such as a bulleted list") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ rules }) => toolResult(await callApi("PUT", "/api/settings/review-rules", { rules }))
  );

  server.registerTool(
    "list_skills",
    {
      title: "List skills",
      description:
        "Your skills: named instructions the reviewer and auto-fix can draw on, such as how your team handles migrations.",
      inputSchema: {},
      annotations: readOnly,
    },
    async () => toolResult(await callApi("GET", "/api/skills"))
  );

  server.registerTool(
    "get_skill",
    {
      title: "Get a skill",
      description: "One skill's full instructions, by its id from list_skills.",
      inputSchema: { id: z.string() },
      annotations: readOnly,
    },
    async ({ id }) => toolResult(await callApi("GET", `/api/skills/${encodeURIComponent(id)}`))
  );

  const skillFields = {
    name: z.string().describe("Letters, numbers, hyphens and underscores only, up to 100"),
    description: z.string().describe("One line on when the skill applies"),
    content: z.string().describe("The instructions, in Markdown"),
  };

  server.registerTool(
    "create_skill",
    {
      title: "Create a skill",
      description: "Add a skill the reviewer and auto-fix can draw on.",
      inputSchema: skillFields,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (skill) => toolResult(await callApi("POST", "/api/skills", skill))
  );

  server.registerTool(
    "update_skill",
    {
      title: "Update a skill",
      description: "Change a skill's name, description or instructions. Only the fields given change.",
      inputSchema: {
        id: z.string(),
        name: skillFields.name.optional(),
        description: skillFields.description.optional(),
        content: skillFields.content.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ id, ...changes }) =>
      toolResult(await callApi("PUT", `/api/skills/${encodeURIComponent(id)}`, changes))
  );

  server.registerTool(
    "delete_skill",
    {
      title: "Delete a skill",
      description: "Delete a skill for good. Confirm with the user first, then pass confirm: true.",
      inputSchema: {
        id: z.string(),
        confirm: z.literal(true).describe("Must be true; ask the user before deleting"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => toolResult(await callApi("DELETE", `/api/skills/${encodeURIComponent(id)}`))
  );

  server.registerTool(
    "get_repository_docs",
    {
      title: "Get a repository's docs",
      description:
        "Fetch a connected repository's README (and docs Contrast reads for context) fresh from GitHub.",
      inputSchema: repository,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ owner, repo }) =>
      toolResult(
        await callApi(
          "POST",
          `/api/org/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/sync-readme`
        )
      )
  );

  return server;
}

/**
 * The /mcp route. `fetchApi` is the BFF itself, which the tools call with the caller's token;
 * `resolveToken` looks the token up (replaceable in tests).
 */
export function createMcpRoutes(
  fetchApi: FetchApi,
  resolveToken: (token: string) => Promise<{ organizationId: string } | null> = findAccessToken
) {
  const routes = new Hono();

  routes.all("/mcp", async (c) => {
    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const access = isAccessToken(token) ? await resolveToken(token) : null;
    if (!access) {
      return c.json(
        {
          error:
            "Sign in with a Contrast access token: Authorization: Bearer cpat_... (create one in the console)",
        },
        401
      );
    }

    const callApi = async (method: string, path: string, body?: unknown): Promise<ApiResult> => {
      const response = await fetchApi(
        new Request(new URL(path, c.req.url), {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Organization-Id": access.organizationId,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      );
      const text = await response.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        // Not JSON; pass the text through
      }
      return { ok: response.ok, status: response.status, data };
    };

    // Stateless: a fresh server and transport per request, answering with plain JSON
    const server = buildServer(callApi);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  return routes;
}
