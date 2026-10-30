export type OpenCodeTask = "review" | "autofix";
export type OpenAiReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

function parseReasoningEffort(value: string | undefined): OpenAiReasoningEffort | undefined {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "none":
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
    case "max":
      return normalized;
    default:
      return undefined;
  }
}

export function resolveOpencodeRuntime(
  task: OpenCodeTask,
  aiConfig: { model: string } | null | undefined,
  env: Record<string, string | undefined> = process.env
): { model: string | undefined; reasoningEffort: OpenAiReasoningEffort | undefined } {
  const prefix = task === "autofix" ? "OPENCODE_AUTOFIX" : "OPENCODE_REVIEW";
  const scopedModel = aiConfig ? undefined : env[`${prefix}_MODEL`]?.trim();
  const scopedEffort = aiConfig ? undefined : env[`${prefix}_REASONING_EFFORT`]?.trim();
  const reasoningEffort = parseReasoningEffort(scopedEffort || env.OPENCODE_REASONING_EFFORT);
  if (scopedEffort && !reasoningEffort) {
    throw new Error(`Invalid ${prefix}_REASONING_EFFORT: ${scopedEffort}`);
  }
  return {
    model: aiConfig?.model || scopedModel || env.OPENCODE_MODEL?.trim() || undefined,
    reasoningEffort,
  };
}
