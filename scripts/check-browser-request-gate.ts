import assert from "node:assert/strict";
import { chromium } from "playwright";
import { browserRequestGate } from "../lib/scrapers/browser-request-gate";

// Synthetic responses only: no fixture request is allowed to leave through Chromium.
async function main() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.E2E_CHROME
      ? { executablePath: process.env.E2E_CHROME }
      : {}),
  });
  const requested: string[] = [];
  const responses: Record<string, { body: string; type: string }> = {
    "/": {
      type: "text/html",
      body: '<h1 id="inventory">Loading</h1><script src="/app.js"></script><script src="https://denied.example.test/ad.js"></script><img src="/photo.jpg">',
    },
    "/app.js": {
      type: "text/javascript",
      body: 'fetch("/inventory.json").then(r=>r.json()).then(r=>document.querySelector("#inventory").textContent=r.title); window.open("/popup"); new Worker("/worker.js");',
    },
    "/inventory.json": {
      type: "application/json",
      body: '{"title":"Verified synthetic inventory"}',
    },
    "/popup": { type: "text/html", body: "<h1>Popup routed</h1>" },
    "/worker.js": {
      type: "text/javascript",
      body: 'fetch("/worker-data.json").then(r=>r.json()).then(r=>postMessage(r));',
    },
    "/worker-data.json": { type: "application/json", body: '{"worker":true}' },
  };
  const gate = browserRequestGate(undefined, {
    assertAllowed(_source, url) {
      assert.ok(url);
      assert.equal(new URL(url).hostname, "inventory.example.test");
      return undefined as never;
    },
    async fetch(url) {
      requested.push(url);
      const fixture = responses[new URL(url).pathname];
      assert.ok(fixture, "unexpected synthetic request");
      return {
        url,
        status: 200,
        body: fixture.body,
        ok: true,
        fromCache: false,
        notModified: false,
        headers: { "content-type": fixture.type },
      };
    },
  });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.route("**/*", gate.handler);
    await context.routeWebSocket("**/*", (socket) => socket.close());
    const page = await context.newPage();
    await page.goto("https://inventory.example.test/", {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(
      () =>
        document.querySelector("#inventory")?.textContent ===
        "Verified synthetic inventory",
    );
    await page.waitForTimeout(500);
    gate.assertHealthy();
    for (const path of Object.keys(responses))
      assert.ok(
        requested.includes(`https://inventory.example.test${path}`),
        `Missing guarded request: ${path}`,
      );
    assert.ok(
      requested.every(
        (url) => new URL(url).hostname === "inventory.example.test",
      ),
    );
    assert.ok(!requested.some((url) => url.endsWith("photo.jpg")));
    console.log(
      JSON.stringify({
        ok: true,
        fixtureOnly: true,
        ...gate.snapshot(),
        covered: [
          "document",
          "script",
          "fetch",
          "popup",
          "worker",
          "denied-host",
          "blocked-image",
        ],
      }),
    );
  } finally {
    gate.close();
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
