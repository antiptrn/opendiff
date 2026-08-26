# review-agent

GitHub webhook service that powers OpenDiff PR reviews, comment replies, and automated remediation.

This package is part of the OpenDiff monorepo. For full platform setup, see the root `README.md`.

## What it does

- Reviews pull requests with OpenCode when PRs are opened, synchronized, or marked ready for review.
- Reviews pull requests when a configured trigger label is added.
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
| `OPENCODE_OAUTH_TOKEN` or (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) | Yes* | Default credential source used by OpenCode when org-level BYOK config is not set. |
| `OPENAI_OAUTH_TOKEN`, `ANTHROPIC_OAUTH_TOKEN` | Optional | Provider-specific OAuth token overrides when not using `OPENCODE_OAUTH_TOKEN`. |
| `GITHUB_APP_ID` + (`GITHUB_PRIVATE_KEY` or `GITHUB_PRIVATE_KEY_PATH`) | Recommended | Preferred GitHub auth mode. Required for `fix-accepted` callback. |
| `GITHUB_TOKEN` | Fallback | Used only when GitHub App auth is not configured. |
| `BOT_USERNAME` | Optional | Defaults to `opendiff-bot`. |
| `BOT_TEAMS` | Optional | Comma-separated team slugs for review-request matching. |
| `REVIEW_TRIGGER_LABELS` | Optional | Comma-separated labels that trigger a PR review when added. Defaults to `opendiff,<BOT_USERNAME>`. |
| `PORT` | Optional | Defaults to `3000`. |
| `SETTINGS_API_URL` | Recommended | BFF URL for repository settings, custom rules, and review recording. |
| `REVIEW_AGENT_API_KEY` | Recommended | Shared secret for internal BFF routes and callback auth. |
| `REVIEW_QUEUE_CONCURRENCY` | Optional | Number of full PR reviews to process at once. Defaults to `1`. |
| `REVIEW_QUEUE_MAX_SIZE` | Optional | Maximum queued full PR reviews before returning `503` for GitHub retry. Defaults to `100`. |
| `REVIEW_QUEUE_MAX_ATTEMPTS` | Optional | Attempts per queued full PR review. Defaults to `2`. |
| `REVIEW_QUEUE_RETRY_DELAY_MS` | Optional | Delay before retrying a failed queued review. Defaults to `15000`. |
| `TRIAGE_QUEUE_CONCURRENCY` | Optional | Number of post-review triage/autofix jobs to process at once. Defaults to `1`. |
| `TRIAGE_QUEUE_MAX_SIZE` | Optional | Maximum queued triage/autofix jobs. Defaults to `100`. |
| `TRIAGE_QUEUE_MAX_ATTEMPTS` | Optional | Attempts per queued triage/autofix job. Defaults to `1`. |
| `TRIAGE_QUEUE_RETRY_DELAY_MS` | Optional | Delay before retrying a failed triage/autofix job. Defaults to `30000`. |
| `OPENCODE_PROMPT_TIMEOUT_MS` | Optional | Hard timeout for OpenCode startup/session/prompt calls. Defaults to `600000`. |
| `OPENCODE_SERVER_TIMEOUT_MS` | Optional | Timeout passed to the OpenCode server client. Defaults to `600000`. |

\* At least one default credential should be set for non-Self-sufficient organizations.

Important behavior:

- If `SETTINGS_API_URL` is missing, repository features are treated as disabled (`effectiveEnabled=false`).
- If both GitHub App and token auth are set, GitHub App auth is preferred for webhook processing.
- For Self-sufficient organizations, review-agent reads org-level auth method, model, and credential from BFF internal APIs.

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
- Full PR review jobs and post-review triage/autofix jobs run in separate in-memory queues.
- Triage attempts to fix up to 10 issues per cycle.
- If triage cannot safely proceed, it asks a clarification question in the relevant review thread.
- With autofix enabled, fixes are committed and pushed to the PR branch, then matching review threads are replied to and resolved.
- With autofix disabled, fix metadata is collected without pushing commits.
- In review comment threads, the bot can distinguish between discussion and explicit "do this" requests and trigger a fix attempt for executable requests.

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
