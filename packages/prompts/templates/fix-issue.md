You are fixing a code review issue. Here are the details:

## Issue Details
- Type: {type}
- Severity: {severity}
- File: {file}
- Line: {line}
- Message: {message}
{suggestionLine}

## Instructions
1. First, read the file {file} to understand the context
2. Fix the issue properly - you have FULL FLEXIBILITY to:
   - Modify the file where the issue was found
   - Create NEW files (e.g., extract code to a new utility module)
   - Modify OTHER files if needed (e.g., add imports)
   - Refactor as needed to properly fix the issue
3. If the suggestion says to extract code to a new file, DO IT

Focus on fixing THIS issue correctly. Make the minimal changes needed but don't be afraid to create new files or modify multiple files if that's the right solution.

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
