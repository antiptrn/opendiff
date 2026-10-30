import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createOpencodeClient } from "@opencode-ai/sdk";
import {
  type OpencodeOauthCredentials,
  loadOpencodeOauthCredentials,
  shouldUseOpencodeAuthJson,
} from "./opencode-auth";
import {
  type OpenAiReasoningEffort,
  type OpenCodeTask,
  resolveOpencodeRuntime,
} from "./opencode-runtime";
import { createManagedOpencode } from "./opencode-server";

type PermissionMode = "read_only" | "read_write" | "no_tools";

type OpencodeInstance = Awaited<ReturnType<typeof createManagedOpencode>>;

/**
 * With OPENCODE_SERVER_PASSWORD set, the OpenCode server we start (which inherits our environment)
 * requires HTTP basic auth, but the SDK's own client doesn't send it, so every call fails. This
 * swaps in a client that does.
 */
function withServerAuth(opencode: OpencodeInstance): OpencodeInstance {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) return opencode;
  const username = process.env.OPENCODE_SERVER_USERNAME || "opencode";
  const credentials = Buffer.from(`${username}:${password}`).toString("base64");
  return {
    ...opencode,
    client: createOpencodeClient({
      baseUrl: opencode.server.url,
      headers: { Authorization: `Basic ${credentials}` },
    }),
  };
}
type SupportedProvider = "anthropic" | "openai";

export type AiAuthMethod = "API_KEY" | "OAUTH_TOKEN";

export interface AiRuntimeConfig {
  authMethod: AiAuthMethod;
  model: string;
  credential: string;
  refreshToken?: string;
  accountId?: string;
}

interface RunOpencodePromptInput {
  cwd: string;
  prompt: string;
  mode: PermissionMode;
  task?: OpenCodeTask;
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

export class OpenCodeAuthError extends Error {
  constructor(message = "OpenCode authentication failed: update the OpenCode auth credentials.") {
    super(message);
    this.name = "OpenCodeAuthError";
  }
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

function messageFromOpenCodeError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return error ? String(error) : "Unknown OpenCode error";
  }

  const record = error as Record<string, unknown>;
  const data = record.data;
  const parts = [
    typeof record.name === "string" ? record.name : "",
    typeof record.message === "string" ? record.message : "",
    typeof record.statusCode === "number" ? String(record.statusCode) : "",
    data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>).message === "string"
      ? String((data as Record<string, unknown>).message)
      : "",
  ].filter(Boolean);

  return parts.join(": ") || "Unknown OpenCode error";
}

export function isOpenCodeAuthError(error: unknown): boolean {
  if (error instanceof OpenCodeAuthError) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : messageFromOpenCodeError(error);
  const normalized = message.toLowerCase();

  return (
    normalized.includes("opencode authentication failed") ||
    (/(^|[^0-9])401([^0-9]|$)/.test(normalized) &&
      /(auth|credential|token|refresh|unauthorized|api key)/.test(normalized))
  );
}

function errorFromOpenCodeInfo(info: unknown): Error | null {
  if (!info || typeof info !== "object" || !("error" in info)) {
    return null;
  }

  const error = (info as { error?: unknown }).error;
  if (!error) {
    return null;
  }

  const message = messageFromOpenCodeError(error);
  if (isOpenCodeAuthError(message)) {
    return new OpenCodeAuthError(
      "OpenCode authentication failed: update the OpenCode auth credentials for the review agent."
    );
  }

  return new Error(`OpenCode provider error: ${message}`);
}

function providerFromModel(model: string): SupportedProvider | null {
  if (model.startsWith("anthropic/")) {
    return "anthropic";
  }
  if (model.startsWith("openai/")) {
    return "openai";
  }
  return null;
}

function providerOverridesForModel(
  model: string | undefined,
  reasoningEffort: OpenAiReasoningEffort | undefined
): Record<string, unknown> | undefined {
  if (!model) {
    return undefined;
  }

  const provider = providerFromModel(model);
  if (provider !== "openai") {
    return undefined;
  }

  if (!reasoningEffort) {
    return undefined;
  }

  const modelId = model.slice("openai/".length);
  return {
    openai: {
      models: {
        [modelId]: {
          options: {
            reasoningEffort,
          },
        },
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeProviderConfig(
  provider: Record<string, unknown> | undefined,
  overrides: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!provider) {
    return overrides;
  }
  if (!overrides) {
    return provider;
  }

  const merged: Record<string, unknown> = { ...provider };
  for (const [providerId, overrideValue] of Object.entries(overrides)) {
    const existingValue = merged[providerId];
    if (!isRecord(existingValue) || !isRecord(overrideValue)) {
      merged[providerId] = overrideValue;
      continue;
    }

    const existingOptions = isRecord(existingValue.options) ? existingValue.options : {};
    const overrideOptions = isRecord(overrideValue.options) ? overrideValue.options : {};
    const existingModels = isRecord(existingValue.models) ? existingValue.models : {};
    const overrideModels = isRecord(overrideValue.models) ? overrideValue.models : {};

    merged[providerId] = {
      ...existingValue,
      ...overrideValue,
      ...(Object.keys(existingOptions).length > 0 || Object.keys(overrideOptions).length > 0
        ? { options: { ...existingOptions, ...overrideOptions } }
        : {}),
      ...(Object.keys(existingModels).length > 0 || Object.keys(overrideModels).length > 0
        ? { models: { ...existingModels, ...overrideModels } }
        : {}),
    };
  }

  return merged;
}

function opencodeServerTimeoutMs(): number {
  const raw = Number(process.env.OPENCODE_SERVER_TIMEOUT_MS?.trim() || "600000");
  return Number.isFinite(raw) && raw > 0 ? raw : 600000;
}

function opencodePromptTimeoutMs(): number {
  const raw = Number(process.env.OPENCODE_PROMPT_TIMEOUT_MS?.trim() || "1800000");
  return Number.isFinite(raw) && raw > 0 ? raw : 1_800_000;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function providerConfigForCredential(
  provider: SupportedProvider,
  credential: string
): Record<string, unknown> {
  return { [provider]: { options: { apiKey: credential } } };
}

function providerConfigFromCredentials(
  credentials: Partial<Record<SupportedProvider, string>>,
  model?: string
): Record<string, unknown> | undefined {
  const provider = model ? providerFromModel(model) : null;

  if (provider) {
    const credential = credentials[provider];
    return credential ? providerConfigForCredential(provider, credential) : undefined;
  }

  const providerConfig: Record<string, unknown> = {};
  for (const [providerId, credential] of Object.entries(credentials)) {
    if (credential) {
      providerConfig[providerId] = { options: { apiKey: credential } };
    }
  }

  return Object.keys(providerConfig).length > 0 ? providerConfig : undefined;
}

function providerConfigFromAiConfig(aiConfig: AiRuntimeConfig): Record<string, unknown> {
  const provider = providerFromModel(aiConfig.model);
  if (!provider) {
    throw new Error(`Unsupported model provider for AI config: ${aiConfig.model}`);
  }

  return providerConfigForCredential(provider, aiConfig.credential);
}

function providerConfigFromEnv(model?: string): Record<string, unknown> | undefined {
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();

  return providerConfigFromCredentials(
    {
      openai: openaiApiKey,
      anthropic: anthropicApiKey,
    },
    model
  );
}

function loadAuthJsonCredentialsByProvider(): Partial<
  Record<SupportedProvider, OpencodeOauthCredentials>
> {
  return {
    openai: loadOpencodeOauthCredentials("openai") ?? undefined,
    anthropic: loadOpencodeOauthCredentials("anthropic") ?? undefined,
  };
}

function providerConfigFromAuthJson(model?: string): Record<string, unknown> | undefined {
  const credentialsByProvider = loadAuthJsonCredentialsByProvider();
  const credentials = {
    openai: credentialsByProvider.openai?.accessToken,
    anthropic: credentialsByProvider.anthropic?.accessToken,
  };

  return providerConfigFromCredentials(credentials, model);
}

function writeTempAuthJsonForCredentials(
  credentialsByProvider: Partial<Record<SupportedProvider, OpencodeOauthCredentials>>
): { tempAuthDir: string; previousXdgDataHome: string | undefined } | null {
  const authJson: Record<string, unknown> = {};

  for (const [provider, credentials] of Object.entries(credentialsByProvider)) {
    if (!credentials?.refreshToken) {
      continue;
    }

    authJson[provider] = {
      type: "oauth",
      access: credentials.accessToken,
      refresh: credentials.refreshToken,
      accountId: credentials.accountId || "",
      expires: credentials.expires || 0,
    };
  }

  if (Object.keys(authJson).length === 0) {
    return null;
  }

  const tempAuthDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-auth-json-"));
  const opencodeDir = path.join(tempAuthDir, "opencode");
  fs.mkdirSync(opencodeDir, { recursive: true, mode: 0o700 });

  fs.writeFileSync(path.join(opencodeDir, "auth.json"), JSON.stringify(authJson, null, 2), {
    mode: 0o600,
  });

  const previousXdgDataHome = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = tempAuthDir;

  return { tempAuthDir, previousXdgDataHome };
}

export async function runOpencodePrompt(
  input: RunOpencodePromptInput
): Promise<RunOpencodePromptResult> {
  return queueOp(async () => {
    const originalCwd = process.cwd();
    let opencode: Awaited<ReturnType<typeof createManagedOpencode>> | null = null;
    let tempAuthDir: string | null = null;
    let originalXdgDataHome: string | undefined;

    try {
      process.chdir(input.cwd);

      const task = input.task ?? "review";
      const { model, reasoningEffort } = resolveOpencodeRuntime(task, input.aiConfig);
      console.log(
        `OpenCode runtime selected: task=${task}, model=${model ?? "default"}, reasoningEffort=${reasoningEffort ?? "default"}`
      );
      const useAuthJson = shouldUseOpencodeAuthJson();

      if (useAuthJson) {
        const credentialsByProvider = loadAuthJsonCredentialsByProvider();
        const authJsonProvider = model ? providerFromModel(model) : null;
        const tempCredentials: Partial<Record<SupportedProvider, OpencodeOauthCredentials>> =
          authJsonProvider
            ? { [authJsonProvider]: credentialsByProvider[authJsonProvider] }
            : credentialsByProvider;
        const tempAuth = writeTempAuthJsonForCredentials(tempCredentials);
        if (tempAuth) {
          tempAuthDir = tempAuth.tempAuthDir;
          originalXdgDataHome = tempAuth.previousXdgDataHome;
        }
      }
      // Legacy support for previously stored OAuth configs. The Self-sufficient
      // settings flow now writes provider API keys only.
      else if (input.aiConfig?.authMethod === "OAUTH_TOKEN" && input.aiConfig.refreshToken) {
        tempAuthDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-byok-"));
        const opencodeDir = path.join(tempAuthDir, "opencode");
        fs.mkdirSync(opencodeDir, { recursive: true, mode: 0o700 });

        const authJson = {
          openai: {
            type: "oauth",
            access: input.aiConfig.credential,
            refresh: input.aiConfig.refreshToken,
            accountId: input.aiConfig.accountId || "",
            expires: 0,
          },
        };
        fs.writeFileSync(path.join(opencodeDir, "auth.json"), JSON.stringify(authJson, null, 2), {
          mode: 0o600,
        });

        originalXdgDataHome = process.env.XDG_DATA_HOME;
        process.env.XDG_DATA_HOME = tempAuthDir;
      }

      const provider = useAuthJson
        ? providerConfigFromAuthJson(model)
        : input.aiConfig
          ? providerConfigFromAiConfig(input.aiConfig)
          : providerConfigFromEnv(model);
      const providerOverrides = providerOverridesForModel(model, reasoningEffort);
      const mergedProvider = mergeProviderConfig(provider, providerOverrides);
      const config = {
        ...(model ? { model } : {}),
        ...(mergedProvider ? { provider: mergedProvider } : {}),
        permission: permissionForMode(input.mode),
      } as Record<string, unknown>;

      const configuredServerPort = process.env.OPENCODE_SERVER_PORT?.trim();
      const serverPort = configuredServerPort ? Number(configuredServerPort) : 0;

      opencode = withServerAuth(
        await createManagedOpencode({
          port: Number.isFinite(serverPort) ? serverPort : 0,
          timeout: opencodeServerTimeoutMs(),
          config: config as Record<string, unknown>,
        })
      );

      const createResult = (await opencode.client.session.create({
        body: {
          title: input.title ?? "review-agent",
        },
      })) as unknown as { data?: { id?: string }; id?: string };

      const sessionId = createResult.data?.id ?? createResult.id;
      if (!sessionId) {
        throw new Error("Failed to create OpenCode session");
      }

      const promptResult = (await withTimeout(
        opencode.client.session.prompt({
          path: { id: sessionId },
          body: {
            parts: [{ type: "text", text: input.prompt }],
            ...(input.format ? { format: input.format } : {}),
          },
        }),
        opencodePromptTimeoutMs(),
        input.title ?? "OpenCode prompt"
      )) as unknown as {
        data?: {
          info?: Record<string, unknown>;
          parts?: unknown;
        };
        info?: Record<string, unknown>;
        parts?: unknown;
      };

      const payload = promptResult.data ?? promptResult;
      const info = payload.info ?? {};
      const providerError = errorFromOpenCodeInfo(info);
      if (providerError) {
        throw providerError;
      }

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
      try {
        await opencode?.server.close();
      } finally {
        // Restore XDG_DATA_HOME and clean up temp auth dir
        if (tempAuthDir) {
          if (originalXdgDataHome !== undefined) {
            process.env.XDG_DATA_HOME = originalXdgDataHome;
          } else {
            process.env.XDG_DATA_HOME = undefined;
          }
          try {
            fs.rmSync(tempAuthDir, { recursive: true, force: true });
          } catch {
            // best effort
          }
        }

        process.chdir(originalCwd);
      }
    }
  });
}
