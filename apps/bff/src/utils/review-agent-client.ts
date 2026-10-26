const REVIEW_AGENT_WEBHOOK_URL = process.env.REVIEW_AGENT_WEBHOOK_URL;
const REVIEW_AGENT_API_KEY = process.env.REVIEW_AGENT_API_KEY;

function getReviewAgentBaseUrl(): string | null {
  if (!REVIEW_AGENT_WEBHOOK_URL) {
    return null;
  }
  return REVIEW_AGENT_WEBHOOK_URL.replace(/\/?$/, "").replace(/\/webhook$/, "");
}

/** A non-2xx answer from the review agent, keeping its status so callers can tell failures apart */
export class ReviewAgentError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(`Review agent request failed (${status}): ${body}`);
  }
}

export async function postToReviewAgent<TResponse>(
  path: string,
  payload: unknown
): Promise<TResponse> {
  const baseUrl = getReviewAgentBaseUrl();
  if (!baseUrl) {
    throw new Error("REVIEW_AGENT_WEBHOOK_URL not configured");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (REVIEW_AGENT_API_KEY) {
    headers["X-API-Key"] = REVIEW_AGENT_API_KEY;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ReviewAgentError(response.status, body);
  }

  return (await response.json()) as TResponse;
}
