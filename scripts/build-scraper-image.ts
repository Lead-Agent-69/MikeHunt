import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pipeline } from "node:stream/promises";

/** Hooks export repo/index/config overrides; child Git commands must stay scoped to cwd. */
export function scraperGitEnv(env: NodeJS.ProcessEnv = process.env) {
  const clean = { ...env };
  for (const key of Object.keys(clean)) {
    if (key.toUpperCase().startsWith("GIT_")) delete clean[key];
  }
  return clean;
}

export function scraperBuildPlan(
  revision: string,
  tag: string,
  cwd = process.cwd(),
  builtAt = new Date().toISOString(),
) {
  if (!/^[a-f0-9]{40}$/.test(revision))
    throw new Error(
      "Supply an exact 40-character commit, not a branch or working tree.",
    );
  if (
    !/^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?$/.test(tag)
  )
    throw new Error("Supply a valid explicit local image tag.");
  if (
    !Number.isFinite(Date.parse(builtAt)) ||
    new Date(builtAt).toISOString() !== builtAt
  )
    throw new Error("Invalid build timestamp.");
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      env: scraperGitEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  if (git(["rev-parse", "--verify", `${revision}^{commit}`]) !== revision)
    throw new Error("Commit identity mismatch.");
  const files = git(["ls-tree", "-r", "-z", "--name-only", revision]).split(
    "\0",
  );
  if (!files.includes("Dockerfile.scraper"))
    throw new Error("Commit has no scraper Dockerfile.");
  if (
    files.some(
      (name) =>
        /^(?:cache|profiles|logs|artifacts|\.vercel|\.codex-remote-attachments)(?:\/|$)/i.test(
          name,
        ) ||
        (/(?:^|\/)\.env(?:\.|\/|$)/i.test(name) &&
          !name.toLowerCase().endsWith(".example")),
    )
  )
    throw new Error(
      "Commit contains protected runtime paths; refusing to send a build context.",
    );
  // Archive content is independent of dirty/untracked files, so no secret file is read or hashed.
  return {
    revision,
    tag,
    builtAt,
    context: "git-archive" as const,
    workingTreeIncluded: false,
    archiveArgs: ["archive", "--format=tar", revision],
    dockerArgs: [
      "build",
      "--file",
      "Dockerfile.scraper",
      "--tag",
      tag,
      "--build-arg",
      `SCRAPER_SOURCE_REVISION=${revision}`,
      "--build-arg",
      `SCRAPER_BUILT_AT=${builtAt}`,
      "--build-arg",
      "SCRAPER_BUILD_CONTEXT=git-archive",
      "-",
    ],
  };
}

export async function buildScraperImage(
  plan: ReturnType<typeof scraperBuildPlan>,
  cwd = process.cwd(),
) {
  const archive = spawn("git", plan.archiveArgs, {
    cwd,
    env: scraperGitEnv(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const docker = spawn("docker", plan.dockerArgs, {
    cwd,
    env: scraperGitEnv(),
    windowsHide: true,
    stdio: ["pipe", "inherit", "inherit"],
  });
  const completed = (child: ChildProcess) =>
    new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error("Archive or image build failed.")),
      );
    });
  const archiveDone = completed(archive);
  const dockerDone = completed(docker);
  try {
    await Promise.all([
      archiveDone,
      dockerDone,
      pipeline(archive.stdout!, docker.stdin!),
    ]);
  } catch (error) {
    archive.kill();
    docker.kill();
    await Promise.allSettled([archiveDone, dockerDone]);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const build = args.includes("--build");
  const positional = args.filter((arg) => arg !== "--build");
  if (positional.length !== 2)
    throw new Error(
      "Usage: npx tsx scripts/build-scraper-image.ts <exact-commit> <image:tag> [--build]. Without --build this only checks the plan.",
    );
  const plan = scraperBuildPlan(positional[0], positional[1]);
  console.log(JSON.stringify(plan, null, 2));
  if (build) await buildScraperImage(plan);
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    console.error(
      "Scraper build failed; check the pinned commit, protected paths and build output. No deployment was performed.",
    );
    process.exitCode = 1;
  });
}
