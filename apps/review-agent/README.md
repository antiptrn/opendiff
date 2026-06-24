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
| `OPENCODE_OAUTH_TOKEN` or (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) | Yes* | Default credential source used by OpenCode when org-level BYOK config is not set. |
| `OPENAI_OAUTH_TOKEN`, `ANTHROPIC_OAUTH_TOKEN` | Optional | Provider-specific OAuth token overrides when not using `OPENCODE_OAUTH_TOKEN`. |
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
| `OPENDIFF_GIT_CACHE_DIR` | Optional | Directory for bare repo cache and temporary worktrees. Defaults to the OS temp dir under `opendiff-git-cache`. |
| `OPENDIFF_GIT_CACHE_REPO_TTL` | Optional | Removes bare repos inactive longer than this duration. Defaults to `6h`. |
| `OPENDIFF_GIT_CACHE_REF_TTL` | Optional | Removes cached branch refs older than this duration. Defaults to `24h`. |
| `OPENDIFF_GIT_CACHE_WORKTREE_TTL` | Optional | Removes leftover worktrees older than this duration. Defaults to `12h`. |
| `OPENDIFF_GIT_CACHE_MAX_REPOS` | Optional | LRU cap for cached bare repos. Defaults to `100`; `0` disables this cap. |
| `OPENDIFF_GIT_CACHE_MAX_BYTES` | Optional | LRU cap for total bare repo cache size. Defaults to `10gb`; `0` disables this cap. |
| `OPENDIFF_GIT_CACHE_DISABLED` | Optional | Set to `true` to use fresh shallow clones instead of the worktree cache. |

\* At least one default credential should be set for non-Self-sufficient organizations.

Important behavior:

- If `SETTINGS_API_URL` is missing, repository features are treated as disabled (`effectiveEnabled=false`).
- If both GitHub App and token auth are set, GitHub App auth is preferred for webhook processing.
- For Self-sufficient organizations, review-agent reads org-level auth method, model, and credential from BFF internal APIs.
- Review-agent uses a bounded bare-repo cache plus per-job worktrees for Git operations. For production, set `OPENDIFF_GIT_CACHE_DIR` to a writable directory on local disk for each worker, such as `/var/lib/opendiff/git-cache` or a container volume mounted on one host. Do not point it at the application checkout, a shared NFS/network filesystem, or a directory shared by multiple concurrently running workers; Git worktree metadata and lock behavior assume low-latency local filesystem semantics. Leaving the default under the OS temp directory is safe, but cache reuse may be lost on container restart.

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
