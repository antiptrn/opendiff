type SupportedProvider = "anthropic" | "openai";

export interface ProviderModelOption {
  id: string;
  name: string;
}

const REVIEW_AGENT_WEBHOOK_URL = process.env.REVIEW_AGENT_WEBHOOK_URL;
const REVIEW_AGENT_API_KEY = process.env.REVIEW_AGENT_API_KEY;
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

let cachedAt = 0;
let cached: Record<SupportedProvider, ProviderModelOption[]> = {
  anthropic: [],
  openai: [],
};

function getReviewAgentBaseUrl(): string | null {
  if (!REVIEW_AGENT_WEBHOOK_URL) {
    return null;
  }
  return REVIEW_AGENT_WEBHOOK_URL.replace(/\/?$/, "").replace(/\/webhook$/, "");
}

function fallbackModels(provider: SupportedProvider): ProviderModelOption[] {
  if (provider === "anthropic") {
    return [{ id: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5" }];
  }
  return [{ id: "openai/gpt-5-codex", name: "GPT-5 Codex" }];
}

function sortModelOptions(options: ProviderModelOption[]): ProviderModelOption[] {
  return [...options].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSupportedProviderModels(): Promise<
  Record<SupportedProvider, ProviderModelOption[]>
> {
  if (cachedAt > 0 && Date.now() - cachedAt < CATALOG_TTL_MS) {
    return cached;
  }

  const baseUrl = getReviewAgentBaseUrl();
  if (!baseUrl) {
    return {
      anthropic: fallbackModels("anthropic"),
      openai: fallbackModels("openai"),
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (REVIEW_AGENT_API_KEY) {
    headers["X-API-Key"] = REVIEW_AGENT_API_KEY;
  }

  try {
    const response = await fetch(`${baseUrl}/internal/provider-models`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`review-agent responded ${response.status}`);
    }

    const data = (await response.json()) as {
      modelsByProvider?: Record<SupportedProvider, ProviderModelOption[]>;
    };

    const catalog = data.modelsByProvider;
    if (!catalog) {
      throw new Error("Invalid provider catalog payload");
    }

    cached = {
      anthropic:
        catalog.anthropic?.length > 0
          ? sortModelOptions(catalog.anthropic)
          : fallbackModels("anthropic"),
      openai:
        catalog.openai?.length > 0 ? sortModelOptions(catalog.openai) : fallbackModels("openai"),
    };
    cachedAt = Date.now();
    return cached;
  } catch (error) {
    console.warn(
      "Failed to fetch provider models from review-agent, using fallback models:",
      error
    );
    return {
      anthropic: fallbackModels("anthropic"),
      openai: fallbackModels("openai"),
    };
  }
}
