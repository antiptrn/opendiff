const REVIEW_AGENT_WEBHOOK_URL = process.env.REVIEW_AGENT_WEBHOOK_URL;
const REVIEW_AGENT_API_KEY = process.env.REVIEW_AGENT_API_KEY;

interface FixAcceptedPayload {
  fixId: string;
  owner: string;
  repo: string;
  pullNumber: number;
  diff: string | null;
  summary: string | null;
  commentBody: string;
  githubCommentId: number | null;
  path: string | null;
  line: number | null;
}

export async function notifyAgentFixAccepted(payload: FixAcceptedPayload) {
  if (!REVIEW_AGENT_WEBHOOK_URL) {
    console.warn("REVIEW_AGENT_WEBHOOK_URL not configured, skipping agent notification");
    return;
  }

  // Target the dedicated fix-accepted callback endpoint
  const callbackUrl = `${REVIEW_AGENT_WEBHOOK_URL.replace(/\/?$/, "").replace(/\/webhook$/, "")}/callback/fix-accepted`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (REVIEW_AGENT_API_KEY) {
    headers["X-API-Key"] = REVIEW_AGENT_API_KEY;
  }

  const response = await fetch(callbackUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Agent callback returned ${response.status}`);
  }
}
