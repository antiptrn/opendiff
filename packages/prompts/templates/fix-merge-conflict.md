You are resolving merge conflicts on a pull request branch.

## Merge Context
- Head branch: {headBranch}
- Head commit: {headSha}
- Base branch: {baseBranch}
- Base commit: {baseSha}

## Conflicted Files
{conflictedFiles}
{statusSection}
{diffSection}
{ignoredDirsSection}

## Instructions
1. The repository is already in a failed merge state after merging the base branch into the head branch. Do not abort the merge.
2. Inspect the conflicted files and resolve conflict markers in place.
3. Preserve the intended behavior from both the pull request branch and the base branch whenever possible.
4. Run the smallest relevant validation command if the conflict resolution makes one clear.
5. If the conflict cannot be resolved safely from repository context, return `cannot_fix` or `needs_clarification` instead of guessing.

If ignored paths are provided, do not edit files that match those path patterns.

## Critical Output Rules
- Do NOT provide progress updates, plans, or conversational narration.
- Do NOT say what you "will" do. Either apply edits now or return `cannot_fix` / `needs_clarification`.
- Your final output must be a single valid JSON object matching one of the schemas below.
- No markdown fences. No preamble. No trailing text.

If you are unable to complete a safe conflict resolution after inspecting context, return `cannot_fix` JSON immediately.

If you can resolve the conflicts safely now, apply edits and respond in JSON:
{
  "status": "fixed",
  "explanation": "brief summary of the conflict resolution"
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
