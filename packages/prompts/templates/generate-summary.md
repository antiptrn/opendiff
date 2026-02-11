You are summarizing an AI code review for a pull request.{cloneContext}

## Pull Request
**Title:** {pullTitle}
**Author:** {pullAuthor}
**Branches:** {headBranch} → {baseBranch}
{pullBodySection}

## Files Changed
{filesChanged}

## Diffs
{diffSection}

## Review Comments ({commentCount})
{commentsList}

## Your Task

1. {readInstruction}
2. Consider the diffs and the review comments together
3. Respond with ONLY a JSON object (no markdown fences, no extra text) in this exact format:

{
  "summary": "Rich markdown summary (see formatting rules below)",
  "fileTitles": {
    "src/auth/login.ts": "Add rate limiting to login endpoint",
    "src/utils/helpers.ts": "Extract shared validation helpers"
  }
}

### Summary formatting rules

Write the summary as **rich markdown** describing what the PR aims to do. Focus on the PURPOSE and CHANGES — NOT on review issues or problems found. Use these techniques:

- **Inline code** for identifiers: e.g. `useOrganization`, `fetchData()`, `isLoading`
- **File references with line numbers**: e.g. `billing-tab.tsx:44-47`, `auth.ts:12`
- **Code blocks** to highlight key changes introduced by the PR:
  ```tsx
  // New handler in auth.ts:22
  export async function verifyToken(token: string) {
    return jwt.verify(token, SECRET);
  }
  ```
- **Narrative paragraphs** explaining what the PR changes, what new behavior it introduces, and how the pieces fit together
- Reference specific functions, variables, and components by name using backticks

Structure: open with a 1-2 sentence overview of what the PR does, then walk through the key changes with inline code and code blocks. Keep it concise but informative — aim for 4-8 sentences plus any code blocks. Do NOT use markdown headings (#). Do NOT repeat the PR title. Do NOT mention review issues, problems found, or fixes — just describe what the PR accomplishes.

The "fileTitles" object must have one entry per changed file listed above. Each value should be a short (3-10 word) descriptive title for what that file's changes do in this PR.
