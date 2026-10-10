import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { safePushPath } from "@/lib/notifications/push";
import { pushSupport } from "@/components/EnablePush";

const sw = readFileSync("public/sw.js", "utf8");
const alerts = readFileSync("lib/scrapers/tools/alerts.ts", "utf8");
const engine = readFileSync("lib/alerts/alert-engine.ts", "utf8");
const status = readFileSync("app/api/push/status/route.ts", "utf8");
const enablePush = readFileSync("components/EnablePush.tsx", "utf8");

// Pull the worker's own safeAppPath out of sw.js so the test runs the shipped code.
const swSafe = new Function(
  `${sw.slice(sw.indexOf("function safeAppPath"), sw.indexOf("// Push notification handling"))}; return safeAppPath;`,
)() as (u: unknown) => string;

describe("push notifications open the right page", () => {
  it.each([safePushPath, swSafe])("only in-app paths are allowed", (fn) => {
    expect(fn("/deal/abc-123")).toBe("/deal/abc-123");
    expect(fn("/alerts?id=9")).toBe("/alerts?id=9");
    expect(fn("https://evil.example/x")).toBe("/alerts");
    expect(fn("//evil.example/x")).toBe("/alerts");
    expect(fn("/\\evil.example")).toBe("/alerts");
    expect(fn(undefined)).toBe("/alerts");
  });

  it("deal alerts and price drops link to the real deal route (/deal/:id)", () => {
    expect(engine).toContain("url: `/deal/${deal.id}`");
    expect(alerts).toContain("url: `/deal/${alert.dealId}`");
    expect(alerts).not.toContain("/deals/${alert.dealId}");
  });

  it("tapping reuses a tab on that page, else navigates one, else opens the app", () => {
    expect(sw).toContain("wins.find((w) => w.url === target)");
    expect(sw).toContain("w.navigate(target)");
    expect(sw).toContain("clients.openWindow(target)");
    expect(sw).toContain("'pushsubscriptionchange'");
  });
});

describe("enable alerts never over-promises", () => {
  it("iOS outside the installed app is told to add to Home Screen", () => {
    const base = {
      hasServiceWorker: true,
      hasPushManager: false,
      hasNotification: false,
    };
    expect(pushSupport({ ...base, isIOS: true, standalone: false })).toBe(
      "ios-needs-install",
    );
    expect(pushSupport({ ...base, isIOS: false, standalone: false })).toBe(
      "unsupported",
    );
    expect(
      pushSupport({
        hasServiceWorker: true,
        hasPushManager: true,
        hasNotification: true,
        isIOS: true,
        standalone: true,
      }),
    ).toBe("supported");
  });

  it("checks the server can send before offering the button, and offers a real test", () => {
    expect(enablePush).toContain('fetch("/api/push/status"');
    expect(enablePush).toContain(
      "Push alerts aren’t switched on for MikeHunt yet",
    );
    expect(enablePush).toContain('fetch("/api/push/test"');
    expect(enablePush).not.toContain("we’ll ping you");
  });

  it("status exposes a boolean only, never key material", () => {
    expect(status).toContain("{ configured }");
    expect(status).not.toMatch(/VAPID_PRIVATE_KEY|app_secrets/);
  });
});
