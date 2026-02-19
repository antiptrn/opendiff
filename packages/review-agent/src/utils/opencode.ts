import { createOpencode } from "@opencode-ai/sdk";

type PermissionMode = "read_only" | "read_write" | "no_tools";

export type AiAuthMethod = "API_KEY" | "OAUTH_TOKEN";

export interface AiRuntimeConfig {
  authMethod: AiAuthMethod;
  model: string;
  credential: string;
}

interface RunOpencodePromptInput {
  cwd: string;
  prompt: string;
  mode: PermissionMode;
  aiConfig?: AiRuntimeConfig | null;
  title?: string;
  format?: {
    type: "json_schema";
    schema: Record<string, unknown>;
    retryCount?: number;
  };
}

interface RunOpencodePromptResult {
  text: string;
  tokensUsed: number;
}

let executionQueue: Promise<void> = Promise.resolve();

function queueOp<T>(fn: () => Promise<T>): Promise<T> {
  const run = executionQueue.then(fn, fn);
  executionQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function permissionForMode(mode: PermissionMode): Record<string, unknown> {
  if (mode === "read_only") {
    return {
      "*": "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      list: "allow",
    };
  }

  if (mode === "read_write") {
    return {
      "*": "deny",
      read: "allow",
      edit: "allow",
      write: "allow",
      glob: "allow",
      grep: "allow",
      list: "allow",
      bash: "deny",
    };
  }

  return { "*": "deny" };
}

function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }

  const textBlocks: string[] = [];
  for (const part of parts) {
    if (
      part &&
      typeof part === "object" &&
      "type" in part &&
      (part as { type?: unknown }).type === "text" &&
      "text" in part &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      textBlocks.push((part as { text: string }).text);
    }
  }

  return textBlocks.join("\n").trim();
}

function extractTokens(info: unknown): number {
  if (!info || typeof info !== "object") {
    return 0;
  }

  const maybeInfo = info as Record<string, unknown>;
  const maybeTokens = maybeInfo.tokens;

  if (maybeTokens && typeof maybeTokens === "object") {
    const tokens = maybeTokens as Record<string, unknown>;
    const total = Number(tokens.total ?? 0);
    if (Number.isFinite(total) && total > 0) {
      return total;
    }

    const input = Number(tokens.input ?? 0);
    const output = Number(tokens.output ?? 0);
    if (Number.isFinite(input) && Number.isFinite(output) && input + output > 0) {
      return input + output;
    }
  }

  const inputTokens = Number(maybeInfo.inputTokens ?? maybeInfo.input_tokens ?? 0);
  const outputTokens = Number(maybeInfo.outputTokens ?? maybeInfo.output_tokens ?? 0);

  if (Number.isFinite(inputTokens) && Number.isFinite(outputTokens)) {
    return inputTokens + outputTokens;
  }
  return 0;
}

function providerFromModel(model: string): "anthropic" | "openai" | null {
  if (model.startsWith("anthropic/")) {
    return "anthropic";
  }
  if (model.startsWith("openai/")) {
    return "openai";
  }
  return null;
}

function providerConfigFromAiConfig(aiConfig: AiRuntimeConfig): Record<string, unknown> {
  const provider = providerFromModel(aiConfig.model);

  if (aiConfig.authMethod === "API_KEY") {
    if (provider === "anthropic") {
      return { anthropic: { options: { apiKey: aiConfig.credential } } };
    }

    if (provider === "openai") {
      return { openai: { options: { apiKey: aiConfig.credential } } };
    }

    throw new Error(`Unsupported model provider for API key auth: ${aiConfig.model}`);
  }

  return {
    anthropic: { options: { apiKey: aiConfig.credential } },
    openai: { options: { apiKey: aiConfig.credential } },
  };
}

function providerConfigFromEnv(model?: string): Record<string, unknown> | undefined {
  const sharedOauthToken = process.env.OPENCODE_OAUTH_TOKEN?.trim();
  const openaiOauthToken = process.env.OPENAI_OAUTH_TOKEN?.trim();
  const anthropicOauthToken = process.env.ANTHROPIC_OAUTH_TOKEN?.trim();
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (sharedOauthToken) {
    return {
      anthropic: { options: { apiKey: sharedOauthToken } },
      openai: { options: { apiKey: sharedOauthToken } },
    };
  }

  const provider = model ? providerFromModel(model) : null;
  if (provider === "openai") {
    const token = openaiOauthToken || openaiApiKey;
    return token ? { openai: { options: { apiKey: token } } } : undefined;
  }

  if (provider === "anthropic") {
    const token = anthropicOauthToken || anthropicApiKey;
    return token ? { anthropic: { options: { apiKey: token } } } : undefined;
  }

  const openaiToken = openaiOauthToken || openaiApiKey;
  const anthropicToken = anthropicOauthToken || anthropicApiKey;
  const providerConfig: Record<string, unknown> = {};

  if (openaiToken) {
    providerConfig.openai = { options: { apiKey: openaiToken } };
  }
  if (anthropicToken) {
    providerConfig.anthropic = { options: { apiKey: anthropicToken } };
  }

  return Object.keys(providerConfig).length > 0 ? providerConfig : undefined;
}

export async function runOpencodePrompt(
  input: RunOpencodePromptInput
): Promise<RunOpencodePromptResult> {
  return queueOp(async () => {
    const originalCwd = process.cwd();
    let opencode: Awaited<ReturnType<typeof createOpencode>> | null = null;

    try {
      process.chdir(input.cwd);

      const model = input.aiConfig?.model || process.env.OPENCODE_MODEL?.trim() || undefined;
      const provider = input.aiConfig
        ? providerConfigFromAiConfig(input.aiConfig)
        : providerConfigFromEnv(model);
      const config = {
        ...(model ? { model } : {}),
        ...(provider ? { provider } : {}),
        permission: permissionForMode(input.mode),
      } as Record<string, unknown>;

      const configuredServerPort = process.env.OPENCODE_SERVER_PORT?.trim();
      const serverPort = configuredServerPort ? Number(configuredServerPort) : 0;

      opencode = await createOpencode({
        port: Number.isFinite(serverPort) ? serverPort : 0,
        config: config as Record<string, unknown>,
      });

      const createResult = (await opencode.client.session.create({
        body: {
          title: input.title ?? "review-agent",
        },
      })) as unknown as { data?: { id?: string }; id?: string };

      const sessionId = createResult.data?.id ?? createResult.id;
      if (!sessionId) {
        throw new Error("Failed to create OpenCode session");
      }

      const promptResult = (await opencode.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: input.prompt }],
          ...(input.format ? { format: input.format } : {}),
        },
      })) as unknown as {
        data?: {
          info?: Record<string, unknown>;
          parts?: unknown;
        };
        info?: Record<string, unknown>;
        parts?: unknown;
      };

      const payload = promptResult.data ?? promptResult;
      const info = payload.info ?? {};
      const structured = info.structured_output;

      let text = extractTextFromParts(payload.parts);
      if (!text && structured && typeof structured === "object") {
        text = JSON.stringify(structured);
      }

      return {
        text,
        tokensUsed: extractTokens(info),
      };
    } finally {
      if (opencode) {
        try {
          opencode.server.close();
        } catch {
          // best effort
        }
      }
      process.chdir(originalCwd);
    }
  });
}
