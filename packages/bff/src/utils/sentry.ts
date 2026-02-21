import * as Sentry from "@sentry/node";

const DEFAULT_SENTRY_DSN =
  "https://6de09e6d20ab3d865fc3296cfb592643@o4510924056297472.ingest.de.sentry.io/4510924065800272";

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN || DEFAULT_SENTRY_DSN;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    sendDefaultPii: true,
  });
}

export { Sentry };
