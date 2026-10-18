import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";
import { expectHealthy, watchHealth } from "./support/health";

test.describe("actual PWA worker integration", () => {
  localOnly();
  test.use({ storageState: storagePath("reseller"), serviceWorkers: "allow" });
  test.beforeEach(({ browserName }) => {
    test.skip(
      browserName !== "chromium",
      "Playwright service-worker automation is supported only on Chromium; real Safari PWA remains a hosted device check.",
    );
  });

  test("activates, keeps account responses out of caches and supplies offline navigation", async ({
    page,
    context,
  }) => {
    const health = watchHealth(page);
    await page.goto("/discover");
    await expect(
      page.getByRole("region", { name: /vehicles$/ }).first(),
    ).toBeVisible();
    await expect
      .poll(
        () =>
          page.evaluate(
            async () =>
              (await navigator.serviceWorker.getRegistration())?.active?.state,
          ),
        { timeout: 20000 },
      )
      .toBe("activated");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Discover", exact: true }),
    ).toBeVisible();
    const result = await page.request.get("/api/preferences");
    expect(result.ok()).toBe(true);
    // Fetch through the controlled page as well, not only through Playwright's API client.
    expect(
      await page.evaluate(
        async () =>
          (await fetch("/api/preferences", { cache: "no-store" })).status,
      ),
    ).toBe(200);
    const leaks = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        if (!name.startsWith("MikeHunt-")) continue;
        for (const request of await (await caches.open(name)).keys()) {
          const path = new URL(request.url).pathname;
          if (
            path.startsWith("/api/") ||
            ["/discover", "/settings", "/saved"].includes(path)
          )
            urls.push(path);
        }
      }
      return urls;
    });
    expect(leaks).toEqual([]);
    await expectHealthy(page, health);
    try {
      await context.setOffline(true);
      await page.goto("/settings");
      await expect(page.locator("h1")).toContainText(/offline/i);
      await expect(
        page
          .getByRole("link", { name: /retry|again|home|back/i })
          .or(page.getByRole("button", { name: /retry|again|home|back/i }))
          .first(),
      ).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
    await page.goto("/discover");
    await expect(
      page.getByRole("heading", { name: "Discover", exact: true }),
    ).toBeVisible();
  });
});
