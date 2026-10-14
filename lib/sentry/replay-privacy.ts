// Onboarding budget, ZIP, and location must not land in Session Replay.
export const replayPrivacy = {
  maskAllText: true,
  blockAllMedia: true,
  // Keep compression off the UI thread without permitting blob workers in CSP.
  workerUrl: "/sentry-replay-worker.js",
};
