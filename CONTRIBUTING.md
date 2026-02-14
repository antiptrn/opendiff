# Contributing to OpenDiff

Thanks for your interest in contributing to OpenDiff! This guide will help you get set up and make your first contribution.

## Prerequisites

- [Bun](https://bun.sh) v1.1.29+
- [PostgreSQL](https://www.postgresql.org/) 15+
- [GitHub App](https://docs.github.com/en/apps) credentials (for review-agent features)
- [Anthropic API Key](https://console.anthropic.com/) (for AI-powered features)

## Getting Started

### 1. Fork and clone

```bash
git clone https://github.com/opendiff/opendiff.git
cd opendiff
bun install
```

### 2. Set up environment variables

Copy the example files for each package you'll be working on:

```bash
cp packages/bff/.env.example packages/bff/.env
cp packages/app/.env.example packages/app/.env
cp packages/website/.env.example packages/website/.env
cp packages/review-agent/.env.example packages/review-agent/.env
```

See the [README](./README.md#environment-setup) for detailed configuration of each `.env` file.

### 3. Set up the database

```bash
cd packages/bff
bunx prisma generate
bunx prisma migrate dev
```

### 4. Start the dev servers

```bash
# All services at once
bun run start:dev

# Or individually
bun run dev:server    # Backend API        → http://localhost:3001
bun run dev:app       # Console dashboard  → http://localhost:5174
bun run dev:website   # Marketing site     → http://localhost:5173
bun run dev:agent     # Review agent       → http://localhost:3000
```

## Project Structure

OpenDiff is a Bun monorepo with these packages:

| Package | Description |
|---------|-------------|
| `bff` | Backend API — Hono, Prisma, PostgreSQL |
| `app` | Console dashboard — React 19, Vite, Tailwind CSS v4 |
| `website` | Marketing site — React 19, Vite, Tailwind CSS v4 |
| `review-agent` | GitHub webhook handler and AI reviewer — Hono, Claude Agent SDK |
| `github` | GitHub App auth and API utilities — Octokit |
| `prompts` | Shared AI prompt templates |
| `components` | Shared UI component library — Radix UI, shadcn |
| `shared` | Shared business logic, hooks, and API services |
| `vscode-extension` | VS Code extension for local code review |
| `assets` | Shared static assets (fonts, icons) |

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a detailed architecture overview.

## Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting. The configuration lives in `biome.json` at the repo root.

Key settings:
- **Indent**: 2 spaces
- **Line width**: 100 characters
- **Quotes**: Double quotes
- **Semicolons**: Always
- **Trailing commas**: ES5

### Running checks

```bash
# Lint
bun run lint

# Auto-fix lint issues
bun run lint:fix

# Format
bun run format

# Run all checks (lint + format)
bun run check
```

Run `bun run check` before committing to catch issues early.

## Testing

```bash
# Run all tests
bun run test

# Run tests for a specific package
bun run --cwd packages/app test:run
bun run --cwd packages/shared test:run
bun run --cwd packages/components test:run
bun run --cwd packages/website test:run
```

## Making Changes

### Branch naming

Use descriptive branch names:

- `feat/add-review-filters` — new functionality
- `fix/webhook-signature-validation` — bug fixes
- `ref/extract-billing-utils` — code improvements
- `docs/update-api-reference` — documentation

### Commit messages

Write clear, conventional & concise commit messages that describe the *why* behind the change:

```
Fix webhook signature validation to prevent unsigned payloads

Add loading states to billing subscription buttons
```

### Database changes

If your change requires a database schema update:

1. Edit `packages/bff/prisma/schema.prisma`
2. Generate a migration: `bunx prisma migrate dev --name describe-your-change`
3. Commit both the schema change and the generated migration

### Adding UI components

The shared component library lives in `packages/components`. It follows [shadcn/ui](https://ui.shadcn.com/) conventions with [Radix UI](https://www.radix-ui.com/) primitives and [CVA](https://cva.style/) for variants.

When adding a new component:
- Place it in `packages/components/src/components/ui/`
- Export it from the package barrel file
- Use Tailwind CSS v4 for styling

### Adding API endpoints

API routes live in `packages/bff/src/routes/`. Follow existing patterns:

- Use `requireAuth()` middleware for authenticated endpoints
- Use `requireOrgAccess(c)` for organization-scoped endpoints
- Return JSON responses with `c.json()`

## Submitting a Pull Request

1. Create a feature branch from `main`
2. Make your changes
3. Run lint and tests: `bun run check && bun run test`
4. Push your branch and open a PR against `main`
5. Fill out the PR description with a summary of what changed and why

### PR checklist

- [ ] Lint and format pass (`bun run check`)
- [ ] Tests pass (`bun run test`)
- [ ] New features include tests where applicable
- [ ] Database migrations are included if schema changed
- [ ] No secrets or credentials are committed

## Reporting Issues

Found a bug or have a feature request? [Open an issue](https://github.com/opendiff/opendiff/issues) with:

- A clear description of the problem or feature
- Steps to reproduce (for bugs)
- Expected vs actual behavior (for bugs)
- Screenshots if relevant

## License

By contributing to OpenDiff, you agree that your contributions will be licensed under the [AGPL-3.0 License](./LICENSE.md).
