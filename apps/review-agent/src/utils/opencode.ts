import * as fs from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { createOpencodeClient } from "@opencode-ai/sdk";
import { loadOpencodeOauthCredentials, resolveOpencodeAuthPath } from "./opencode-auth";

type PermissionMode = "read_only" | "read_write" | "no_tools";
type OpenAiReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

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

type OpenCodeExecutionLane = "read" | "write";

interface ScopedOpencode {
  client: ReturnType<typeof createOpencodeClient>;
  server: {
    url: string;
    close(): void;
  };
}

const executionQueues = new Map<OpenCodeExecutionLane, Promise<void>>();

function executionLaneForMode(mode: PermissionMode): OpenCodeExecutionLane {
  return mode === "read_write" ? "write" : "read";
}

function queueOp<T>(
  lane: OpenCodeExecutionLane,
  title: string,
  fn: () => Promise<T>
): Promise<T> {
  const queuedAt = Date.now();
  const executionQueue = executionQueues.get(lane) ?? Promise.resolve();
  const run = executionQueue.then(
    async () => {
      const waitMs = Date.now() - queuedAt;
      if (waitMs > 1000) {
        console.log(`OpenCode lane wait completed: title=${title}, lane=${lane}, waitMs=${waitMs}`);
      }
      return fn();
    },
    async () => {
      const waitMs = Date.now() - queuedAt;
      if (waitMs > 1000) {
        console.log(`OpenCode lane wait completed: title=${title}, lane=${lane}, waitMs=${waitMs}`);
      }
      return fn();
    }
  );
  executionQueues.set(
    lane,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

function stopProcess(proc: ChildProcessWithoutNullStreams): void {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return;
  }
  proc.kill();
}

function buildChildEnv(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return env;
}

async function createScopedOpencode(options: {
  cwd: string;
  port: number;
  timeout: number;
  config: Record<string, unknown>;
  env: Record<string, string | undefined>;
}): Promise<ScopedOpencode> {
  const args = ["serve", "--hostname=127.0.0.1", `--port=${options.port}`];
  const logLevel = options.config.logLevel;
  if (typeof logLevel === "string" && logLevel) {
    args.push(`--log-level=${logLevel}`);
  }

  const proc = spawn("opencode", args, {
    cwd: options.cwd,
    env: buildChildEnv({
      ...options.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(options.config),
    }),
  });

  const url = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stopProcess(proc);
      reject(new Error(`Timeout waiting for server to start after ${options.timeout}ms`));
    }, options.timeout);

    let output = "";
    let resolved = false;

    proc.stdout.on("data", (chunk) => {
      if (resolved) {
        return;
      }

      output += chunk.toString();
      for (const line of output.split("\n")) {
        if (!line.startsWith("opencode server listening")) {
          continue;
        }

        const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
        if (!match) {
          stopProcess(proc);
          clearTimeout(timeout);
          reject(new Error(`Failed to parse server url from output: ${line}`));
          return;
        }

        resolved = true;
        clearTimeout(timeout);
        resolve(match[1]);
        return;
      }
    });

    proc.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    proc.on("exit", (code) => {
      if (resolved) {
        return;
      }

      clearTimeout(timeout);
      let message = `Server exited with code ${code}`;
      if (output.trim()) {
        message += `\nServer output: ${output}`;
      }
      reject(new Error(message));
    });

    proc.on("error", (error) => {
      if (resolved) {
        return;
      }

      clearTimeout(timeout);
      reject(error);
    });
  });

  return {
    client: createOpencodeClient({ baseUrl: url }),
    server: {
      url,
      close() {
        stopProcess(proc);
      },
    },
  };
}

function createTempXdgEnv(prefix: string): {
  root: string;
  dataHome: string;
  authPath: string;
  env: Record<string, string>;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dataHome = path.join(root, "data");
  const authDir = path.join(dataHome, "opencode");
  fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });

  return {
    root,
    dataHome,
    authPath: path.join(authDir, "auth.json"),
    env: {
      XDG_DATA_HOME: dataHome,
      XDG_STATE_HOME: path.join(root, "state"),
      XDG_CACHE_HOME: path.join(root, "cache"),
      XDG_CONFIG_HOME: path.join(root, "config"),
    },
  };
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

function providerFromModel(model: string): "anthropic" | "openai" | null {
  if (model.startsWith("anthropic/")) {
    return "anthropic";
  }
  if (model.startsWith("openai/")) {
    return "openai";
  }
  return null;
}

function openAiReasoningEffortFromEnv(): OpenAiReasoningEffort | null {
  const value = process.env.OPENCODE_REASONING_EFFORT?.trim().toLowerCase();
  switch (value) {
    case "none":
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return value;
    default:
      return null;
  }
}

function providerOverridesForModel(model?: string): Record<string, unknown> | undefined {
  if (!model) {
    return undefined;
  }

  const provider = providerFromModel(model);
  if (provider !== "openai") {
    return undefined;
  }

  const reasoningEffort = openAiReasoningEffortFromEnv();
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

function opencodeServerTimeoutMs(): number {
  const raw = Number(process.env.OPENCODE_SERVER_TIMEOUT_MS?.trim() || "600000");
  return Number.isFinite(raw) && raw > 0 ? raw : 600000;
}

function opencodePromptTimeoutMs(): number {
  const raw = Number(process.env.OPENCODE_PROMPT_TIMEOUT_MS?.trim() || "1800000");
  return Number.isFinite(raw) && raw > 0 ? raw : 1_800_000;
}

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  onTimeout?: () => void
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          onTimeout?.();
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function isUnsupportedChmodError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return code === "EPERM" || code === "ENOTSUP" || code === "EOPNOTSUPP";
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
    const authFileToken = loadOpencodeOauthCredentials("openai")?.accessToken;
    const token = openaiOauthToken || openaiApiKey || authFileToken;
    return token ? { openai: { options: { apiKey: token } } } : undefined;
  }

  if (provider === "anthropic") {
    const authFileToken = loadOpencodeOauthCredentials("anthropic")?.accessToken;
    const token = anthropicOauthToken || anthropicApiKey || authFileToken;
    return token ? { anthropic: { options: { apiKey: token } } } : undefined;
  }

  const openaiToken =
    openaiOauthToken || openaiApiKey || loadOpencodeOauthCredentials("openai")?.accessToken;
  const anthropicToken =
    anthropicOauthToken ||
    anthropicApiKey ||
    loadOpencodeOauthCredentials("anthropic")?.accessToken;
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
  const title = input.title ?? "review-agent";
  const lane = executionLaneForMode(input.mode);

  return queueOp(lane, title, async () => {
    const runStartedAt = Date.now();
    const tempXdg = createTempXdgEnv(`opencode-${lane}-`);
    const childEnv: Record<string, string | undefined> = {
      ...tempXdg.env,
      OPENCODE_AUTH_PATH: undefined,
    };
    let opencode: ScopedOpencode | null = null;
    let persistAuthBackTo: string | null = null;
    let modelForLog = process.env.OPENCODE_MODEL?.trim() || "default";

    try {
      const model = input.aiConfig?.model || process.env.OPENCODE_MODEL?.trim() || undefined;
      modelForLog = model || "default";
      const envProvider = model ? providerFromModel(model) : null;
      const envOauthCredentials =
        !input.aiConfig && envProvider ? loadOpencodeOauthCredentials(envProvider) : null;

      console.log(
        `OpenCode run starting: title=${title}, lane=${lane}, mode=${input.mode}, model=${modelForLog}, promptChars=${input.prompt.length}, cwd=${input.cwd}`
      );

      // For BYOK OAuth users with refresh token, create a temp auth.json
      // so the opencode CodexAuthPlugin can authenticate via the Codex auth flow
      if (
        input.aiConfig?.authMethod === "OAUTH_TOKEN" &&
        input.aiConfig.refreshToken
      ) {
        const authJson = {
          openai: {
            type: "oauth",
            access: input.aiConfig.credential,
            refresh: input.aiConfig.refreshToken,
            accountId: input.aiConfig.accountId || "",
            expires: 0,
          },
        };
        fs.writeFileSync(tempXdg.authPath, JSON.stringify(authJson, null, 2), { mode: 0o600 });
        childEnv.OPENCODE_AUTH_PATH = tempXdg.authPath;
        console.log(`OpenCode auth prepared: title=${title}, source=byok-oauth-temp`);
      }
      // For default runtime auth backed by a mounted OpenCode auth.json, prefer using
      // a local XDG data dir for the OpenCode sqlite DB, then copy refreshed auth
      // back to the mounted auth file. Azure Files does not support sqlite WAL mode.
      else if (envProvider && envOauthCredentials?.refreshToken) {
        const authPath = resolveOpencodeAuthPath();
        fs.copyFileSync(authPath, tempXdg.authPath);
        fs.chmodSync(tempXdg.authPath, 0o600);
        persistAuthBackTo = authPath;
        childEnv.OPENCODE_AUTH_PATH = tempXdg.authPath;
        console.log(`OpenCode auth prepared: title=${title}, source=mounted-auth-copy`);
      } else {
        console.log(`OpenCode auth prepared: title=${title}, source=isolated-xdg`);
      }

      const provider = input.aiConfig
        ? providerConfigFromAiConfig(input.aiConfig)
        : providerConfigFromEnv(model);
      const providerOverrides = providerOverridesForModel(model);
      const config = {
        ...(model ? { model } : {}),
        ...(provider ? { provider } : {}),
        ...(providerOverrides
          ? {
              provider: {
                ...((provider as Record<string, unknown> | undefined) ?? {}),
                ...providerOverrides,
              },
            }
          : {}),
        permission: permissionForMode(input.mode),
      } as Record<string, unknown>;

      const configuredServerPort = process.env.OPENCODE_SERVER_PORT?.trim();
      const serverPort = configuredServerPort ? Number(configuredServerPort) : 0;
      const promptTimeoutMs = opencodePromptTimeoutMs();

      const startupStartedAt = Date.now();
      opencode = await withTimeout(
        createScopedOpencode({
          cwd: input.cwd,
          port: Number.isFinite(serverPort) ? serverPort : 0,
          timeout: opencodeServerTimeoutMs(),
          config: config as Record<string, unknown>,
          env: childEnv,
        }),
        promptTimeoutMs,
        "OpenCode server startup"
      );
      console.log(
        `OpenCode server startup completed: title=${title}, lane=${lane}, model=${modelForLog}, elapsedMs=${elapsedMs(startupStartedAt)}, totalElapsedMs=${elapsedMs(runStartedAt)}`
      );

      const sessionStartedAt = Date.now();
      const createResult = (await withTimeout(
        opencode.client.session.create({
          body: {
            title,
          },
        }),
        promptTimeoutMs,
        "OpenCode session creation"
      )) as unknown as { data?: { id?: string }; id?: string };
      console.log(
        `OpenCode session created: title=${title}, lane=${lane}, model=${modelForLog}, elapsedMs=${elapsedMs(sessionStartedAt)}, totalElapsedMs=${elapsedMs(runStartedAt)}`
      );

      const sessionId = createResult.data?.id ?? createResult.id;
      if (!sessionId) {
        throw new Error("Failed to create OpenCode session");
      }

      const promptStartedAt = Date.now();
      const promptResult = (await withTimeout(
        opencode.client.session.prompt({
          path: { id: sessionId },
          body: {
            parts: [{ type: "text", text: input.prompt }],
            ...(input.format ? { format: input.format } : {}),
          },
        }),
        promptTimeoutMs,
        "OpenCode prompt",
        () => {
          try {
            opencode?.server.close();
          } catch {
            // best effort
          }
        }
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

      const tokensUsed = extractTokens(info);
      console.log(
        `OpenCode prompt completed: title=${title}, lane=${lane}, model=${modelForLog}, elapsedMs=${elapsedMs(promptStartedAt)}, totalElapsedMs=${elapsedMs(runStartedAt)}, tokensUsed=${tokensUsed}, textChars=${text.length}`
      );

      return {
        text,
        tokensUsed,
      };
    } catch (error) {
      console.error(
        `OpenCode run failed: title=${title}, lane=${lane}, model=${modelForLog}, totalElapsedMs=${elapsedMs(runStartedAt)}, error=${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    } finally {
      if (opencode) {
        try {
          opencode.server.close();
          console.log(
            `OpenCode server closed: title=${title}, lane=${lane}, model=${modelForLog}, totalElapsedMs=${elapsedMs(runStartedAt)}`
          );
        } catch {
          // best effort
        }
      }

      if (persistAuthBackTo && fs.existsSync(tempXdg.authPath)) {
        try {
          fs.copyFileSync(tempXdg.authPath, persistAuthBackTo);
          console.log(`Persisted refreshed OpenCode auth: title=${title}`);
        } catch (error) {
          console.warn("Failed to persist refreshed OpenCode auth:", error);
        }

        try {
          fs.chmodSync(persistAuthBackTo, 0o600);
        } catch (error) {
          if (!isUnsupportedChmodError(error)) {
            console.warn("Failed to chmod persisted OpenCode auth:", error);
          }
        }
      }

      try {
        fs.rmSync(tempXdg.root, { recursive: true, force: true });
      } catch {
        // best effort
      }
    }
  });
}
