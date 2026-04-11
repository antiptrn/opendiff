# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install

# Copy source
COPY tsconfig.json biome.json ./
COPY src ./src

# Build TypeScript
RUN bun run build

# Production stage
FROM oven/bun:1 AS runner

WORKDIR /app

# Install git and SSL certificates for cloning repos over HTTPS
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

# Install opencode CLI (required by @opencode-ai/sdk at runtime)
# Install into a shared prefix so the non-root user can access the binary.
ENV BUN_INSTALL=/usr/local
RUN bun install -g opencode-ai

# Copy built files and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Set ownership (oven/bun image provides a built-in 'bun' user at uid 1000)
RUN chown -R bun:bun /app

USER bun

# Environment variables (to be provided at runtime)
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["bun", "run", "dist/index.js"]
