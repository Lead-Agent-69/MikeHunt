import * as Sentry from "@sentry/nextjs";
import { replayPrivacy } from "@/lib/sentry/replay-privacy";
import { isRecoveryCredentialPage } from "@/lib/sentry/credential-page";

// Browser / client runtime init. In @sentry/nextjs v8+ Next.js loads THIS file for the client (the old
// `sentry.client.config.ts` name is no longer auto-detected), so client errors + Session Replay only
// activate once this exists.
Sentry.init({
  // The email confirmation screen carries a bearer hash. Its explicit POST
  // consumes the hash, then a full clean-URL navigation restores monitoring.
  enabled:
    typeof window === "undefined" ||
    !isRecoveryCredentialPage(window.location.href),
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Session Replay: 10% of all sessions, 100% of sessions with an error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  debug: false,
  integrations: [Sentry.replayIntegration(replayPrivacy)],
});

// App Router navigation instrumentation — ties client-side route changes into tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
