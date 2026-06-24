You are fixing a failing CI check on a pull request.

## CI Failure
- Check: {checkName}
- Conclusion: {conclusion}
- Commit: {headSha}
{urlLine}
{summarySection}
{textSection}
{annotationsSection}
{ignoredDirsSection}

## Instructions
1. Inspect the repository and CI failure details to identify the likely failing code path.
2. Run the smallest relevant local validation command if the failure details make one clear.
3. Apply a minimal code change that addresses the CI failure.
4. If the failure is flaky, external to the repository, lacks actionable details, or cannot be reproduced safely, return `cannot_fix` or `needs_clarification` instead of guessing.

If ignored paths are provided, do not edit files that match those path patterns.

## Critical Output Rules
- Do NOT provide progress updates, plans, or conversational narration.
- Do NOT say what you "will" do. Either apply edits now or return `cannot_fix` / `needs_clarification`.
- Your final output must be a single valid JSON object matching one of the schemas below.
- No markdown fences. No preamble. No trailing text.

If you are unable to complete a safe code change after inspecting context, return `cannot_fix` JSON immediately.

If you can fix it safely now, apply edits and respond in JSON:
{
  "status": "fixed",
  "explanation": "brief summary of changes"
}

If you need user input before making a safe change, do NOT edit files and respond in JSON:
{
  "status": "needs_clarification",
  "explanation": "why clarification is needed",
  "clarificationQuestion": "single clear question for the user"
}

If you cannot fix it in this environment, respond in JSON:
{
  "status": "cannot_fix",
  "explanation": "why it could not be fixed"
}

Output JSON only.
