# review-agent

AI-powered GitHub code review agent using Claude. Assign it as a reviewer on your PRs to get intelligent feedback on anti-patterns, security issues, and code quality.

## Features

- **Anti-pattern Detection**: Identifies code smells, god objects, tight coupling
- **Security Analysis**: Catches SQL injection, XSS, hardcoded secrets
- **Performance Issues**: N+1 queries, memory leaks, blocking operations
- **Style & Best Practices**: Naming, error handling, TypeScript types
- **Bug Risk Assessment**: Off-by-one errors, null safety, race conditions

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/JuliusWallblom/review-agent.git
cd review-agent
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required environment variables:
- `GITHUB_WEBHOOK_SECRET` - Secret for webhook signature validation
- `GITHUB_TOKEN` - Personal access token with `repo` scope
- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `BOT_USERNAME` - GitHub username that will receive review requests

### 3. Run Locally

```bash
npm run dev
```

### 4. Deploy on Raspberry Pi

```bash
# Build and run with Docker
docker-compose up -d

# Or build manually
docker build -t review-agent .
docker run -d -p 3000:3000 --env-file .env review-agent
```

## GitHub Setup

### Create a Webhook

1. Go to your repository → Settings → Webhooks → Add webhook
2. **Payload URL**: `http://your-raspberry-pi:3000/webhook`
3. **Content type**: `application/json`
4. **Secret**: Same as `GITHUB_WEBHOOK_SECRET`
5. **Events**: Select "Pull requests"

### Expose to Internet

For GitHub to reach your Raspberry Pi, you need to expose port 3000. Options:

- **Cloudflare Tunnel** (recommended): Free, secure, no port forwarding
- **ngrok**: Quick for testing
- **Port forwarding**: Direct but requires static IP

## Usage

1. Create a PR in your repository
2. Add the bot as a reviewer (or add to a team that gets review requests)
3. The agent will analyze the code and post a review

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run typecheck

# Build
npm run build
```

## Architecture

```
src/
├── index.ts           # HTTP server entry point
├── webhook/
│   ├── handler.ts     # Webhook request handling
│   └── validator.ts   # Signature validation
├── github/
│   ├── client.ts      # GitHub API wrapper
│   └── types.ts       # TypeScript types
├── agent/
│   ├── reviewer.ts    # Claude AI review logic
│   └── types.ts       # Review types
└── review/
    └── formatter.ts   # GitHub comment formatting
```

## License

MIT
