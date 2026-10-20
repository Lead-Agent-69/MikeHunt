import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const extraArgs = process.argv.slice(2);

const result = spawnSync(
  process.execPath,
  [
    playwrightCli,
    "test",
    "--project=desktop",
    "--project=mobile-390",
    ...extraArgs,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      E2E_BASE_URL: "https://mikehunt-69.vercel.app",
    },
  },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
