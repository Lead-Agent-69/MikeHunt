import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isAuthorizedCron } from "./cron-auth";

const ORIGINAL = process.env.CRON_SECRET;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
});

describe("isAuthorizedCron", () => {
  it("accepts only the bearer header", () => {
    process.env.CRON_SECRET = "cron-test-secret";
    const ok = new NextRequest("https://app.test/api/alerts/process", {
      headers: { authorization: "Bearer cron-test-secret" },
    });
    expect(isAuthorizedCron(ok)).toBe(true);

    const query = new NextRequest(
      "https://app.test/api/alerts/process?secret=cron-test-secret",
    );
    expect(isAuthorizedCron(query)).toBe(false);
  });

  it("rejects a same-length bearer mismatch", () => {
    process.env.CRON_SECRET = "cron-test-secret";
    const request = new NextRequest("https://app.test/api/alerts/process", {
      headers: { authorization: "Bearer cron-test-secreT" },
    });
    expect(isAuthorizedCron(request)).toBe(false);
  });

  it("rejects a different-length bearer without accepting it", () => {
    process.env.CRON_SECRET = "cron-test-secret";
    const request = new NextRequest("https://app.test/api/alerts/process", {
      headers: { authorization: "Bearer cron-test-secret-extra" },
    });
    expect(isAuthorizedCron(request)).toBe(false);
    const missing = new NextRequest("https://app.test/api/alerts/process");
    expect(isAuthorizedCron(missing)).toBe(false);
  });

  it("locks the endpoint when the secret is unset", () => {
    delete process.env.CRON_SECRET;
    const request = new NextRequest("https://app.test/api/orchestrator/run", {
      headers: { authorization: "Bearer anything" },
    });
    expect(isAuthorizedCron(request)).toBe(false);
  });
});
