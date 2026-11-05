import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import type { FilePayload, ReviewResult } from "shared/types";
import { CodeReviewAgent } from "../agent/reviewer";
import type { AiRuntimeConfig } from "../utils/opencode";

export async function runLocalReview(input: {
  files: FilePayload[];
  title: string;
  sensitivity: number;
  aiConfig?: AiRuntimeConfig | null;
}): Promise<{ review: ReviewResult; tokensUsed: number }> {
  const workingDir = mkdtempSync(`${tmpdir()}/opendiff-local-`);

  try {
    const realWorkingDir = realpathSync(workingDir);
    for (const file of input.files) {
      const filePath = resolve(realWorkingDir, file.filename);
      if (!filePath.startsWith(`${realWorkingDir}/`)) {
        throw new Error("Invalid filename");
      }
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, file.content);
    }

    const review = await new CodeReviewAgent(input.aiConfig).reviewFiles(
      input.files,
      { prTitle: input.title, prBody: null, sensitivity: input.sensitivity },
      workingDir
    );
    return { review, tokensUsed: review.tokensUsed ?? 0 };
  } finally {
    rmSync(workingDir, { recursive: true, force: true });
  }
}
