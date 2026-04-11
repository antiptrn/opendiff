# bff

Backend API for OpenDiff (auth, billing, repositories, settings, notifications).

## Setup

```bash
cp .env.example .env
bun install
```

## Run

```bash
bun run dev
```

## Rate Limiting

- Configure `REDIS_URL` in `.env` to enable shared Redis-backed rate limiting across instances.
- In production behind Cloudflare, `CF-Connecting-IP` is preferred for client IP detection.
- Keep `RATE_LIMIT_TRUST_PROXY_HEADERS=false` unless your proxy chain is fully trusted.
