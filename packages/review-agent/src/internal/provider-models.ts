import { createOpencode } from "@opencode-ai/sdk";

export interface ProviderModelOption {
  id: string;
  name: string;
}

export interface ProviderModelsCatalog {
  anthropic: ProviderModelOption[];
  openai: ProviderModelOption[];
}

let cache: ProviderModelsCatalog | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function fallbackCatalog(): ProviderModelsCatalog {
  return {
    anthropic: [{ id: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
    openai: [{ id: "openai/gpt-5-codex", name: "GPT-5 Codex" }],
  };
}

function normalizeProviderModels(payload: unknown, providerId: "anthropic" | "openai") {
  const root = (payload ?? {}) as {
    all?: Array<{
      id?: string;
      models?: Record<string, { name?: string; status?: string }>;
    }>;
  };

  const provider = root.all?.find((p) => p.id === providerId);
  const models = provider?.models ?? {};

  const ids = new Set(Object.keys(models));

  const options = Object.entries(models)
    .filter(([id, meta]) => {
      if (meta?.status === "deprecated") {
        return false;
      }

      // Hide snapshot IDs in UI model picker; OpenCode CLI focuses on stable aliases.
      if (/\d{8}$/.test(id)) {
        return false;
      }

      // Hide legacy Anthropic generation-3 models from the picker.
      if (providerId === "anthropic" && id.startsWith("claude-3-")) {
        return false;
      }

      // Hide Codex Spark variants from the settings picker.
      if (providerId === "openai" && id.includes("spark")) {
        return false;
      }

      // Hide dated snapshots when a stable alias exists.
      // Example: keep `claude-sonnet-4-5`, drop `claude-sonnet-4-5-20250929`.
      const maybeAlias = id.replace(/-\d{8}$/, "");
      if (maybeAlias !== id && ids.has(maybeAlias)) {
        return false;
      }

      return true;
    })
    .map(([id, meta]) => ({
      id: `${providerId}/${id}`,
      name: meta?.name || id,
    }));

  options.sort((a, b) => a.name.localeCompare(b.name));
  return options;
}

export async function getProviderModelsCatalog(): Promise<ProviderModelsCatalog> {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) {
    return cache;
  }

  const opencode = await createOpencode();
  try {
    const result = (await opencode.client.provider.list()) as unknown as {
      data?: unknown;
    };
    const payload = result.data ?? result;

    const catalog: ProviderModelsCatalog = {
      anthropic: normalizeProviderModels(payload, "anthropic"),
      openai: normalizeProviderModels(payload, "openai"),
    };

    if (catalog.anthropic.length === 0 || catalog.openai.length === 0) {
      const fallback = fallbackCatalog();
      cache = {
        anthropic: catalog.anthropic.length ? catalog.anthropic : fallback.anthropic,
        openai: catalog.openai.length ? catalog.openai : fallback.openai,
      };
    } else {
      cache = catalog;
    }

    cacheAt = Date.now();
    return cache;
  } catch (error) {
    console.warn("Failed to list provider models via OpenCode SDK:", error);
    return fallbackCatalog();
  } finally {
    try {
      opencode.server.close();
    } catch {
      // best effort
    }
  }
}
