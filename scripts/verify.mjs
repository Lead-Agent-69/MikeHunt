// scripts/verify.mjs
//
// THE LOCAL CI GATE. Runs the exact same checks as .github/workflows/ci.yml — typecheck, lint, tests —
// but on your machine, so we don't depend on GitHub Actions minutes (which keep running out). The
// pre-push hook (.husky/pre-push) runs this, so nothing reaches main without passing. Kiro owns keeping
// this green (see docs/handouts/KIRO.md). Run manually any time:  npm run verify
//
// Exit 0 = safe to push. Non-zero = a stage failed; the failing stage's output is printed above the summary.

import { spawnSync } from "node:child_process";

const STAGES = [
  { name: "Typecheck", cmd: "npx", args: ["tsc", "--noEmit"] },
  // eslint exits non-zero only on ERRORS (warnings are allowed), matching the CI gate.
  { name: "Lint", cmd: "npx", args: ["eslint", "."] },
  { name: "Tests", cmd: "npx", args: ["vitest", "run"] },
  // `next build` — the ONLY stage that catches build-only breaks (RSC serialization, server/client
  // boundary, a route that fails page-data collection). Typecheck+lint+tests all pass on those, so they
  // used to reach main and fail on Vercel. Skippable for fast local loops: VERIFY_SKIP_BUILD=1.
  ...(process.env.VERIFY_SKIP_BUILD
    ? []
    : [{ name: "Build", cmd: "npx", args: ["next", "build"] }]),
];

const isWin = process.platform === "win32";
const t0 = Date.now();
const results = [];

for (const stage of STAGES) {
  process.stdout.write(`\n\x1b[1m▶ ${stage.name}\x1b[0m\n`);
  const started = Date.now();
  const r = spawnSync(stage.cmd, stage.args, {
    stdio: "inherit",
    shell: isWin, // Windows needs shell:true to resolve npx/.cmd
    env: process.env,
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const ok = r.status === 0;
  results.push({ name: stage.name, ok, secs });
  if (!ok) {
    // Stop at the first failure — fix it, re-run. (Matches a CI gate's fail-fast behavior.)
    printSummary(results, false);
    process.exit(r.status || 1);
  }
}

printSummary(results, true);

function printSummary(results, allPassed) {
  const total = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write(`\n\x1b[1m── verify summary ──\x1b[0m\n`);
  for (const { name, ok, secs } of results) {
    const mark = ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    process.stdout.write(`  ${mark} ${name} (${secs}s)\n`);
  }
  if (allPassed) {
    process.stdout.write(`\x1b[32m\x1b[1m✓ all checks passed\x1b[0m (${total}s) — safe to push\n`);
  } else {
    const failed = results[results.length - 1]?.name;
    process.stdout.write(
      `\x1b[31m\x1b[1m✗ ${failed} failed\x1b[0m (${total}s) — fix the output above, then \`npm run verify\` again\n`,
    );
  }
}
