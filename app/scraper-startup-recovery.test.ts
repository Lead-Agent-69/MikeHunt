import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("scraper display startup recovery", () => {
  const script = readFileSync("scripts/start-scraper-local.sh", "utf8");

  it("reuses a live Xvfb process and removes only stale display-99 markers", () => {
    expect(script).toContain("/proc/$LOCK_PID/comm");
    expect(script).toContain('= "Xvfb"');
    expect(script).toContain("rm -f /tmp/.X99-lock /tmp/.X11-unix/X99");
    expect(script).not.toMatch(/rm\s+-rf\s+\/tmp/);
  });

  it("fails closed when a newly started display server exits", () => {
    expect(script).toContain('kill -0 "$XVFB_PID"');
    expect(script).toContain('echo "[xvfb] display 99 failed to start"');
    expect(script).toContain('if [ "$XVFB_OWNED" -eq 1 ]');
  });
});
