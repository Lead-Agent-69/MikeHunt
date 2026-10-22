import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  auditProductionDependencies,
  PRODUCTION_AUDIT_ARGS,
} from "../scripts/audit-production-dependencies.mjs";

const clean = {
  status: 0,
  stdout: JSON.stringify({
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        total: 0,
      },
    },
  }),
  stderr: "",
};
const unavailable = {
  status: 1,
  stdout: JSON.stringify({
    error: { code: "E503", summary: "503 Service Unavailable" },
  }),
  stderr: "",
};
const execute = (run: any) =>
  auditProductionDependencies({
    run,
    pause: vi.fn(async () => {}),
    log: vi.fn(),
  });

describe("mandatory production security audit", () => {
  it("passes only after a complete successful audit", async () => {
    const run = vi.fn(() => clean);
    expect(await execute(run)).toBe(0);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("retries an HTTP 503 and requires the next complete audit to pass", async () => {
    const run = vi.fn().mockReturnValueOnce(unavailable).mockReturnValue(clean);
    expect(await execute(run)).toBe(0);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("keeps the gate closed after three registry failures", async () => {
    const run = vi.fn(() => unavailable);
    expect(await execute(run)).toBe(1);
    expect(run).toHaveBeenCalledTimes(3);
  });
  it("retries npm's untyped network-timeout response", async () => {
    const run = vi
      .fn()
      .mockReturnValueOnce({
        status: 1,
        stdout: JSON.stringify({
          message:
            "network timeout at: https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
          error: { summary: "", detail: "" },
        }),
        stderr: "npm warn audit network timeout",
      })
      .mockReturnValue(clean);
    expect(await execute(run)).toBe(0);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it.each(["high", "critical"])(
    "never retries or accepts a %s finding",
    async (severity) => {
      const report = JSON.parse(clean.stdout);
      report.metadata.vulnerabilities[severity] = 1;
      report.metadata.vulnerabilities.total = 1;
      // Even an incorrect zero process exit status cannot hide a reported finding.
      const run = vi.fn(() => ({ ...clean, stdout: JSON.stringify(report) }));
      expect(await execute(run)).toBe(1);
      expect(run).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["", "not-json", JSON.stringify({ error: { code: "E401" } })])(
    "rejects incomplete or unauthorized responses: %s",
    async (stdout) => {
      const run = vi.fn(() => ({ ...clean, stdout }));
      expect(await execute(run)).toBe(1);
      expect(run).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects process launch failures", async () => {
    const run = vi.fn(() => ({
      status: null,
      stdout: "",
      stderr: "",
      error: { code: "ENOENT" },
    }));
    expect(await execute(run)).toBe(1);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("retains the mandatory high/critical production audit after installation", () => {
    expect(PRODUCTION_AUDIT_ARGS).toContain("--omit=dev");
    expect(PRODUCTION_AUDIT_ARGS).toContain("--audit-level=high");
    expect(PRODUCTION_AUDIT_ARGS).not.toContain("fix");
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const audit = workflow.slice(
      workflow.indexOf("- name: Run npm audit"),
      workflow.indexOf("- name: Cleanup workspace"),
    );
    expect(audit).toContain(
      "run: node scripts/audit-production-dependencies.mjs",
    );
    expect(audit).not.toContain("continue-on-error");
    expect(audit).not.toContain("if:");
  });
});
