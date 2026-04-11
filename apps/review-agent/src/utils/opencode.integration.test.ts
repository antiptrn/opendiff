import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type AiRuntimeConfig, runOpencodePrompt } from "./opencode";

const RUN_LIVE = process.env.RUN_OPENCODE_LIVE_TEST === "1";

function getLiveConfig(): AiRuntimeConfig {
  const model = process.env.OPENDIFF_LIVE_AI_MODEL || "anthropic/claude-sonnet-4-5";
  const authMethod =
    (process.env.OPENDIFF_LIVE_AI_AUTH_METHOD as AiRuntimeConfig["authMethod"] | undefined) ||
    "API_KEY";

  let credential = process.env.OPENDIFF_LIVE_AI_CREDENTIAL || "";
  if (!credential && authMethod === "API_KEY") {
    credential = model.startsWith("openai/")
      ? (process.env.OPENAI_API_KEY ?? "")
      : (process.env.ANTHROPIC_API_KEY ?? "");
  }

  if (!credential) {
    throw new Error(
      "Missing live AI credential. Set OPENDIFF_LIVE_AI_CREDENTIAL or provider API key."
    );
  }

  return {
    authMethod,
    model,
    credential,
  };
}

describe("runOpencodePrompt (live)", () => {
  (RUN_LIVE ? it : it.skip)(
    "executes a real OpenCode prompt without mocks",
    async () => {
      const aiConfig = getLiveConfig();
      const workingDir = await mkdtemp(join(tmpdir(), "opencode-live-"));

      try {
        await writeFile(
          join(workingDir, "sample.ts"),
          "export const sum = (a: number, b: number) => a + b;\n"
        );

        const response = await runOpencodePrompt({
          cwd: workingDir,
          mode: "read_only",
          aiConfig,
          title: "live-opencode-test",
          prompt:
            'Read sample.ts and reply with valid JSON only: {"ok": true, "file": "sample.ts", "notes": "..."}',
        });

        console.log("[live opencode] tokensUsed:", response.tokensUsed);
        console.log("[live opencode] raw response:", response.text);

        expect(response.tokensUsed).toBeGreaterThan(0);
        expect(response.text.length).toBeGreaterThan(0);

        const cleaned = response.text
          .replace(/^```(?:json)?\s*\n?/i, "")
          .replace(/\n?```\s*$/i, "")
          .trim();
        const parsed = JSON.parse(cleaned) as { ok?: boolean; file?: string };
        expect(parsed.ok).toBe(true);
        expect(parsed.file).toBe("sample.ts");
      } finally {
        await rm(workingDir, { recursive: true, force: true });
      }
    },
    120000
  );
});
