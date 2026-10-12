import { describe, expect, it } from "vitest";
import { auditStorage } from "../scripts/storage-audit.mjs";

function execute(_command: string, args: string[]) {
  if (args[0] === "count-objects") return "size-pack: 10 MiB";
  if (args[0] === "ls-files") return "";
  if (args[0] === "exec") return "100 /app/cache";
  if (args.at(-1)?.includes("Mounts"))
    return JSON.stringify(
      ["cache", "logs", "profiles"].map((name) => ({
        Type: "bind",
        Source: `/worker/${name}`,
        Destination: `/app/${name}`,
      })),
    );
  return JSON.stringify({
    Type: "json-file",
    Config: { "max-size": "10m", "max-file": "3", secret: "do-not-print" },
  });
}

describe("read-only storage audit", () => {
  it("checks only scoped read commands and never certifies hosted capacity", () => {
    const commands: string[][] = [];
    const report = auditStorage((command: string, args: string[]) => {
      commands.push([command, ...args]);
      return execute(command, args);
    });
    expect(report.status).toBe("observed");
    expect(report.hostedUsage).toContain("unknown");
    expect(commands.map((c) => c.slice(0, 2))).toEqual([
      ["git", "count-objects"],
      ["git", "ls-files"],
      ["docker", "inspect"],
      ["docker", "exec"],
      ["docker", "inspect"],
    ]);
    expect(JSON.stringify(report)).not.toContain("do-not-print");
  });

  it("keeps unavailable Docker evidence unknown without hiding Git evidence", () => {
    const report = auditStorage((command: string, args: string[]) => {
      if (command === "docker") throw new Error("unavailable secret details");
      return execute(command, args);
    });
    expect(report.status).toBe("unverified");
    expect(report.checks.gitObjects.status).toBe("observed");
    expect(report.checks.scraperMounts.status).toBe("unknown");
    expect(JSON.stringify(report)).not.toContain("secret details");
  });

  it("warns on tracked runtime data, missing persistent mounts and unlimited logs", () => {
    const report = auditStorage((command: string, args: string[]) => {
      if (args[0] === "ls-files") return "cache/private.json";
      if (args.at(-1)?.includes("Mounts")) return "[]";
      if (args.at(-1)?.includes("LogConfig"))
        return JSON.stringify({ Type: "json-file", Config: {} });
      return execute(command, args);
    });
    expect(report.status).toBe("warn");
    expect(report.checks.trackedRuntimeData.status).toBe("warn");
    expect(report.checks.scraperMounts.missing).toHaveLength(3);
    expect(report.checks.dockerLogging.status).toBe("warn");
  });
});
