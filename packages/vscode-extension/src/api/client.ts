import type { LocalReviewRequest, ReviewResult } from "../types";

export async function postLocalReview(
  serverUrl: string,
  token: string,
  request: LocalReviewRequest
): Promise<ReviewResult> {
  const url = `${serverUrl}/api/reviews/local`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Server error (${response.status}): ${body}`);
  }

  return response.json();
}
