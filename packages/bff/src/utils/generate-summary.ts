import { getOrgAiRuntimeConfig } from "./ai-config";
import { postToReviewAgent } from "./review-agent-client";

interface ReviewCommentInput {
  body: string;
  path: string | null;
  line: number | null;
  fixStatus: string | null;
}

export interface GenerateSummaryInput {
  orgId: string;
  owner: string;
  repo: string;
  pullNumber: number;
  headBranch: string;
  pullTitle: string | null;
  pullBody: string | null;
  pullAuthor: string | null;
  baseBranch: string | null;
  comments: ReviewCommentInput[];
}

export interface GenerateSummaryResult {
  summary: string;
  fileTitles: Record<string, string>;
}

export async function generateReviewSummary(
  input: GenerateSummaryInput
): Promise<GenerateSummaryResult> {
  const aiConfig = await getOrgAiRuntimeConfig(input.orgId);

  // aiConfig is null when org hasn't configured BYOK credentials — fall through
  // to let the review-agent use platform-default credentials from env vars.

  return await postToReviewAgent<GenerateSummaryResult>("/internal/generate-summary", {
    ...input,
    aiConfig,
  });
}
