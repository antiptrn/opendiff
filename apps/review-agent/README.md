# review-agent

GitHub webhook service that powers OpenDiff PR reviews, comment replies, and automated remediation.

This package is part of the OpenDiff monorepo. For full platform setup, see the root `README.md`.

## What it does

- Reviews pull requests with OpenCode when PRs are opened, synchronized, or marked ready for review.
- Replies to PR comments when the bot is mentioned (inline review comments and issue comments on PRs).
- Runs triage after reviews to attempt automated fixes.
- Can push auto-fixes when `autofixEnabled` is enabled in repository settings.
- Exposes a callback endpoint for "fix accepted" actions to apply diffs and push commits.

## Endpoints

- `GET /health` - health check.
- `POST /webhook` - GitHub webhook receiver.
- `POST /callback/fix-accepted` - internal callback for accepted fixes.

## Environment variables

Copy `.env.example` to `.env` and configure values.

| Variable | Required | Notes |
|---|---|---|
| `GITHUB_WEBHOOK_SECRET` | Yes | Validates webhook signatures. |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Yes* | OpenDiff-owned provider API keys used for active paid non-BYOK plans. The selected model provider determines which key is used. |
| `OPENCODE_USE_AUTH_JSON` | Optional | Debug override. When truthy, OpenCode uses `auth.json` for all plans instead of org BYOK keys or OpenDiff provider API keys. |
| `OPENCODE_AUTH_PATH` | Optional | Path to the OpenCode `auth.json` file when `OPENCODE_USE_AUTH_JSON` is enabled. |
| `OPENCODE_MODEL` | Optional | Default model when org-level config is absent, or the debug `auth.json` override is enabled. |
| `OPENCODE_REASONING_EFFORT` | Optional | Default OpenAI reasoning effort: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`, depending on model support. |
| `OPENCODE_REVIEW_MODEL` | Optional | Override the default model for reviews, summaries, and comment responses. |
| `OPENCODE_REVIEW_REASONING_EFFORT` | Optional | Override the default OpenAI reasoning effort for review-related calls. |
| `OPENCODE_AUTOFIX_MODEL` | Optional | Override the default model for `TriageAgent.fixIssue`, including fixes requested through comment replies. |
| `OPENCODE_AUTOFIX_REASONING_EFFORT` | Optional | Override the default OpenAI reasoning effort for autofix calls. |
| `GITHUB_APP_ID` + (`GITHUB_PRIVATE_KEY` or `GITHUB_PRIVATE_KEY_PATH`) | Recommended | Preferred GitHub auth mode. Required for `fix-accepted` callback. |
| `GITHUB_TOKEN` | Fallback | Used only when GitHub App auth is not configured. |
| `BOT_USERNAME` | Optional | Defaults to `opendiff-bot`. |
| `BOT_TEAMS` | Optional | Comma-separated team slugs for review-request matching. |
| `PORT` | Optional | Defaults to `3000`. |
| `SETTINGS_API_URL` | Recommended | BFF URL for repository settings, custom rules, and review recording. |
| `REVIEW_AGENT_API_KEY` | Recommended | Shared secret for internal BFF routes and callback auth. |
| `REVIEW_QUEUE_CONCURRENCY` | Optional | Number of full PR reviews to process at once. Defaults to `1`. |
| `REVIEW_QUEUE_MAX_SIZE` | Optional | Maximum queued full PR reviews before returning `503` for GitHub retry. Defaults to `100`. |
| `REVIEW_QUEUE_MAX_ATTEMPTS` | Optional | Attempts per queued full PR review. Defaults to `2`. |
| `REVIEW_QUEUE_RETRY_DELAY_MS` | Optional | Delay before retrying a failed queued review. Defaults to `15000`. |

\* Set the provider keys for every non-BYOK model provider you enable.

Important behavior:

- If `SETTINGS_API_URL` is missing, repository features are treated as disabled (`effectiveEnabled=false`).
- If both GitHub App and token auth are set, GitHub App auth is preferred for webhook processing.
- For Self-sufficient organizations, review-agent reads the org-level model and matching provider API key from BFF internal APIs.
- For active Pro/Ultra organizations, review-agent uses OpenDiff-owned provider API keys from env vars.
- If `OPENCODE_USE_AUTH_JSON` is enabled, `auth.json` overrides both of those credential paths for debugging.

## Local development

From monorepo root:

```bash
bun install
bun run dev:agent
```

Or from this package:

```bash
bun run dev
```

## Webhook setup

Configure a GitHub webhook pointing to this service:

- Payload URL: `https://<your-host>/webhook`
- Content type: `application/json`
- Secret: same value as `GITHUB_WEBHOOK_SECRET`
- Events:
  - `Pull requests`
  - `Pull request review comments`
  - `Issue comments`

## Triage and auto-fix flow

- Review issues are generated first.
- Triage attempts to fix up to 10 issues per cycle.
- If triage cannot safely proceed, it asks a clarification question in the relevant review thread.
- With autofix enabled, fixes are committed and pushed to the PR branch, then matching review threads are replied to and resolved.
- With autofix disabled, fix metadata is collected without pushing commits.
- In review comment threads, the bot can distinguish between discussion and explicit "do this" requests and trigger a fix attempt for executable requests.

## Task-specific models

Reviews, summaries, and comment responses use the review defaults. Actual fix attempts use the autofix defaults, regardless of whether a fix was triggered automatically or requested in a comment. Without task-specific settings, both continue to use `OPENCODE_MODEL` and `OPENCODE_REASONING_EFFORT`. Each setting falls back independently; configuring only an autofix model does not change its reasoning effort.

For example:

```env
OPENCODE_REVIEW_MODEL=openai/gpt-6.1-terra
OPENCODE_REVIEW_REASONING_EFFORT=max
OPENCODE_AUTOFIX_MODEL=openai/gpt-6.1-sol
OPENCODE_AUTOFIX_REASONING_EFFORT=high
```

Task overrides apply only when no organization AI configuration is passed. An organization's explicit model continues to use its existing credentials and the global reasoning setting. The selected default model's provider still needs valid credentials. Reasoning overrides apply only to OpenAI models; choose an effort supported by the selected model. An invalid non-empty task-specific effort fails before starting OpenCode instead of silently using another effort.

## Scripts

- `bun run dev` - watch mode
- `bun run build` - build to `dist/`
- `bun run start` - run built server
- `bun run test` - run tests
- `bun run typecheck` - TypeScript check
- `bun run lint` - lint package
- `bun run check` - biome check

## Docker

This package includes `Dockerfile` and `docker-compose.yml` for containerized deployment.

```bash
docker-compose up -d --build
```
