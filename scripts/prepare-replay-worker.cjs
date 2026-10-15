const { copyFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

// Use the installed SDK's worker so its protocol stays matched across upgrades.
module.exports = function prepareReplayWorker(
  publicDir = join(__dirname, "..", "public"),
) {
  const source = require.resolve("@sentry/replay/worker-bundler");
  const target = join(publicDir, "sentry-replay-worker.js");
  mkdirSync(publicDir, { recursive: true });
  copyFileSync(source, target);
  return target;
};
