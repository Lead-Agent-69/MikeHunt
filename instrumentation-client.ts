import * as Sentry from "@sentry/nextjs";

// Browser / client runtime init. In @sentry/nextjs v8+ Next.js loads THIS file for the client (the old
// `sentry.client.config.ts` name is no longer auto-detected), so client errors + Session Replay only
// activate once this exists.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Session Replay: 10% of all sessions, 100% of sessions with an error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  debug: false,
  integrations: [
    Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
  ],
});

// App Router navigation instrumentation — ties client-side route changes into tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
