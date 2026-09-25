import * as Sentry from "@sentry/nextjs";

// Server-side registration hook. In @sentry/nextjs v8+, the Node + Edge SDKs are initialized HERE (by
// importing the runtime configs) — without this file they never load, so server/API errors go uncaptured.
// This was the gap: the repo had sentry.server/edge.config.ts but no instrumentation.ts to register them.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Auto-captures EVERY unhandled server-side request error (API routes, server actions, RSC). Requires
// @sentry/nextjs >= 8.28.0. This is what turns a leads-API outage into a Sentry page instead of a silent
// 500 — the exact failure that went unnoticed before.
export const onRequestError = Sentry.captureRequestError;
