import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = join(root, ".next", "standalone");
const server = join(standaloneDir, "server.js");

if (!existsSync(server)) {
  console.error("Standalone build not found. Run `npm run build` first.");
  process.exit(1);
}

const staticSrc = join(root, ".next", "static");
const staticDest = join(standaloneDir, ".next", "static");
if (existsSync(staticSrc)) {
  cpSync(staticSrc, staticDest, { recursive: true });
}

const publicSrc = join(root, "public");
const publicDest = join(standaloneDir, "public");
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true });
}

const child = spawn(process.execPath, [server], {
  cwd: standaloneDir,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
