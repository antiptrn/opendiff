# OpenDiff

AI-powered code review platform that automatically reviews pull requests, detects anti-patterns, security issues, and code quality problems using Claude AI.

## Overview

OpenDiff is a SaaS platform that integrates with GitHub to provide:

- **Automated Code Reviews** - AI analyzes pull requests for anti-patterns, security vulnerabilities, performance issues, and bugs
- **Intelligent Triage** - Automatically fixes detected issues and commits changes back to the PR
- **Team Collaboration** - Organization-based access with role management and seat-based subscriptions
- **Custom Skills** - Define custom review instructions that the AI agent follows when reviewing your code
- **Custom Review Rules** - Configure per-repository review guidelines and coding standards

## Architecture

<p align="center">
  <img alt="OpenDiff Architecture" src="docs/architecture.png" width="800">
</p>

> **[View detailed architecture documentation →](./ARCHITECTURE.md)**

## Packages

| Package | Description | Tech Stack |
|---------|-------------|------------|
| [`opendiff-bff`](./opendiff-bff) | Backend API with auth, billing, and data management | Hono, Prisma, PostgreSQL, S3, Resend |
| [`opendiff-app`](./opendiff-app) | Main console dashboard and management UI | React 19, Vite, Tailwind CSS v4 |
| [`opendiff-website`](./opendiff-website) | Marketing website and landing pages | React 19, Vite, Tailwind CSS v4 |
| [`opendiff-review-agent`](./opendiff-review-agent) | GitHub webhook handler and AI code reviewer | Hono, Claude Agent SDK, Octokit |
| [`opendiff-components`](./opendiff-components) | Shared UI component library | Radix UI, shadcn, CVA |
| [`opendiff-shared`](./opendiff-shared) | Shared business logic, hooks, and services | React Query, React Router |
| [`opendiff-assets`](./opendiff-assets) | Shared static assets (fonts, icons) | - |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.1.29+
- [PostgreSQL](https://www.postgresql.org/) 15+
- [GitHub App](https://docs.github.com/en/apps) credentials
- [Anthropic API Key](https://console.anthropic.com/)

### Installation

```bash
# Clone the repository
git clone https://github.com/opendiff/opendiff.git
cd opendiff

# Install dependencies
bun install
```

### Environment Setup

Each package requires its own environment configuration. Copy the example files and configure:

```bash
# Server
cp opendiff-bff/.env.example opendiff-bff/.env

# App (Console)
cp opendiff-app/.env.example opendiff-app/.env

# Website
cp opendiff-website/.env.example opendiff-website/.env

# Review Agent
cp opendiff-review-agent/.env.example opendiff-review-agent/.env
```

#### Server Configuration

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/opendiff

# OAuth Providers
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
MICROSOFT_CLIENT_ID=xxx
MICROSOFT_CLIENT_SECRET=xxx

# Payment Provider (polar or stripe)
PAYMENT_PROVIDER=polar
POLAR_ACCESS_TOKEN=xxx
POLAR_WEBHOOK_SECRET=xxx

# S3 Storage (for avatars, etc.)
S3_BUCKET=xxx
S3_REGION=xxx
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx

# Email (Resend)
RESEND_API_KEY=xxx

# URLs
FRONTEND_URL=http://localhost:5173
APP_URL=http://localhost:5174
PORT=3001
```

#### App Configuration

```env
VITE_API_URL=http://localhost:3001
```

#### Website Configuration

```env
VITE_API_URL=http://localhost:3001
```

#### Review Agent Configuration

```env
# GitHub App Authentication
GITHUB_APP_ID=xxx
GITHUB_PRIVATE_KEY_PATH=/path/to/private-key.pem
GITHUB_WEBHOOK_SECRET=xxx

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# Server Integration
SETTINGS_API_URL=http://localhost:3001
REVIEW_AGENT_API_KEY=xxx

PORT=3000
```

### Database Setup

```bash
cd opendiff-bff

# Generate Prisma client
bunx prisma generate

# Run migrations
bunx prisma migrate dev
```

### Running Locally

```bash
# Start all services concurrently
bun run start:dev

# Or start individually (in separate terminals)
bun run dev:server    # Backend API on http://localhost:3001
bun run dev:app       # Console dashboard on http://localhost:5174
bun run dev:website   # Marketing site on http://localhost:5173
bun run dev:agent     # Review agent on http://localhost:3000
```

## Development

### Available Scripts

From the monorepo root:

```bash
# Development
bun run dev:server     # Start server in watch mode
bun run dev:app        # Start console app dev server
bun run dev:website    # Start website dev server
bun run dev:agent      # Start review agent in watch mode
bun run start:dev      # Start all services concurrently

# Building
bun run build          # Build website for production
bun run build:app      # Build console app for production
bun run build:agent    # Build review agent for production

# Code Quality
bun run lint           # Lint all packages
bun run lint:fix       # Auto-fix linting issues
bun run format         # Format all code
bun run check          # Run all checks

# Testing
bun run test           # Run tests for all packages

# Process Management
bun run start:dev:nohup   # Start all services in background (dev)
bun run start:prod:nohup  # Start all services in background (prod)
bun run stop              # Stop all background services
```

### Code Quality

The project uses [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Check for issues
bun run lint

# Auto-fix issues
bun run lint:fix

# Format code
bun run format
```

### Testing

```bash
# Run all tests
bun run test

# Run tests for specific package
cd opendiff-app && bun run test
cd opendiff-website && bun run test
cd opendiff-components && bun run test
cd opendiff-shared && bun run test

# With coverage
bun run test:coverage
```

## Features

### Code Review Categories

The AI reviewer analyzes code for:

| Category | Examples |
|----------|----------|
| **Security** | SQL injection, XSS, hardcoded secrets, insecure crypto |
| **Anti-patterns** | God objects, tight coupling, magic numbers, copy-paste code |
| **Performance** | N+1 queries, memory leaks, blocking operations |
| **Style** | Naming conventions, error handling, missing types |
| **Bug Risks** | Off-by-one errors, null safety, race conditions |

### Custom Skills

Skills are user-defined instructions that the AI agent follows during code reviews. Each skill includes:

- **Name** - Unique identifier (e.g., `security-review`, `api-standards`)
- **Description** - Short description for skill routing
- **Content** - Detailed instructions for the agent

Skills are automatically applied based on the repository configuration and team membership.

### Issue Severity Levels

- **Critical** - Must be fixed before merging
- **Warning** - Should be addressed
- **Suggestion** - Optional improvements

### Subscription Tiers

| Tier | Features |
|------|----------|
| **Free** | Basic access, limited reviews |
| **Code Review** | Automated PR reviews, custom rules |
| **Triage** | Reviews + automatic issue fixing |
| **BYOK** | Bring Your Own Key - use your Anthropic API key |

## Deployment

### Console App (Static)

```bash
cd opendiff-app
bun run build
# Deploy dist/ to your static host
```

### Website (Static)

```bash
cd opendiff-website
bun run build
# Deploy dist/ to your static host
```

### Server

Deploy as a standard Node.js/Bun application with PostgreSQL database.

### Review Agent (Docker)

```bash
cd opendiff-review-agent

# Build image
docker build -t opendiff-review-agent .

# Run with docker-compose
docker-compose up -d
```

## API Reference

### Authentication

All authenticated endpoints require:
- `Authorization: Bearer <token>` header
- `X-Organization-Id: <org-id>` header (for org-scoped requests)

### Key Endpoints

#### Repositories
- `GET /api/repos` - List available repositories
- `GET /api/org/repos` - List organization repositories
- `PUT /api/settings/:owner/:repo` - Update repository settings

#### Reviews
- `GET /api/reviews` - List reviews for organization
- `GET /api/stats` - Get review statistics
- `POST /api/reviews` - Record a completed review (internal)

#### Skills
- `GET /api/skills` - List user's skills (paginated, searchable)
- `POST /api/skills` - Create a new skill
- `PUT /api/skills/:id` - Update a skill
- `DELETE /api/skills/:id` - Delete a skill

#### Billing
- `GET /api/subscription/status` - Check subscription status
- `POST /api/subscription/create` - Create new subscription
- `GET /api/billing` - Get billing information

#### Organizations
- `GET /api/organization` - Get organization details
- `GET /api/organization/members` - List organization members
- `POST /api/organization/invites` - Create invite
- `DELETE /api/organization/invites/:id` - Revoke invite

## Project Structure

```
opendiff/
├── opendiff-bff/          # Backend API
│   ├── src/
│   │   ├── index.ts          # Main server entry
│   │   ├── routes/           # API route handlers
│   │   │   ├── account.ts
│   │   │   ├── billing.ts
│   │   │   ├── internal.ts
│   │   │   ├── organizations.ts
│   │   │   ├── repos.ts
│   │   │   ├── reviews.ts
│   │   │   └── skills.ts
│   │   ├── auth.ts           # OAuth authentication
│   │   ├── db.ts             # Prisma client
│   │   └── payments/         # Polar/Stripe integration
│   └── prisma/
│       └── schema.prisma     # Database schema
│
├── opendiff-app/             # Console Dashboard
│   └── src/
│       ├── features/         # Feature modules
│       │   ├── admin/
│       │   ├── billing/
│       │   ├── dashboard/
│       │   ├── notifications/
│       │   ├── repositories/
│       │   ├── reviews/
│       │   └── settings/
│       ├── components/       # App-specific components
│       └── main.tsx          # App entry point
│
├── opendiff-website/         # Marketing Website
│   └── src/
│       ├── features/         # Feature modules
│       └── components/       # Website components
│
├── opendiff-review-agent/    # AI Code Reviewer
│   └── src/
│       ├── agent/            # Claude AI integration
│       │   ├── reviewer.ts   # Code review agent
│       │   └── triage.ts     # Auto-fix agent
│       ├── utils/
│       │   ├── git.ts        # Git operations
│       │   └── skill-hydrator.ts  # Skill materialization
│       └── webhook/          # GitHub webhook handlers
│
├── opendiff-components/      # UI Component Library
│   └── src/
│       ├── components/
│       │   └── ui/           # Primitives (Button, Dialog, etc.)
│       ├── hooks/            # Shared React hooks
│       ├── utils/            # Utility functions
│       └── constants/        # Shared constants
│
├── opendiff-shared/          # Shared Business Logic
│   └── src/
│       ├── auth/             # Authentication logic
│       ├── billing/          # Billing logic
│       ├── organizations/    # Organization management
│       ├── services/         # API services, query keys
│       └── navigation/       # Navigation utilities
│
├── opendiff-assets/          # Shared Static Assets
│   └── public/
│       ├── typefaces/        # Font files (Saans, Interphases, etc.)
│       ├── icons/            # OAuth provider icons
│       └── icon.svg          # Favicon
│
├── scripts/                  # Build and deployment scripts
├── biome.json                # Linting configuration
└── package.json              # Workspace configuration
```

## Database Schema

### Core Models

- **User** - Multi-OAuth user accounts (GitHub, Google, Microsoft)
- **Organization** - Teams with subscription management
- **OrganizationMember** - User membership and seat allocation
- **OrganizationInvite** - Pending team invites
- **RepositorySettings** - Per-repo review configuration
- **Review** - Review history tracking
- **ReviewComment** - Individual review comments
- **ReviewFix** - Automated fix tracking
- **Skill** - User-defined review instructions
- **SkillResource** - Additional resources attached to skills
- **AuditLog** - Security audit trail

See [`opendiff-bff/prisma/schema.prisma`](./opendiff-bff/prisma/schema.prisma) for the complete schema.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run linting and tests (`bun run check && bun run test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Support

- [Documentation](https://docs.opendiff.dev)
- [Discord Community](https://discord.gg/opendiff)
- [GitHub Issues](https://github.com/opendiff/opendiff/issues)
