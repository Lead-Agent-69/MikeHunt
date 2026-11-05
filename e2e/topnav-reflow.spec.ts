import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";

test.describe("TopNav reflow", () => {
  localOnly();
  test.use({ storageState: storagePath("personal") });

  test("keeps header targets reachable at 200% CSS scaling without clipping", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1200, height: 1000 });
    await page.goto("/market?scope=explicit&browse=1");
    const header = page.locator("header").first();
    await expect(header.getByRole("link", { name: "All tools" })).toBeVisible();
    await expect(page.locator("[data-market-vehicle]").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // CSS zoom deliberately retains the desktop media query. Native browser zoom
    // instead reduces the CSS viewport, so this exercises a different failure mode.
    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    const bounds = await header.locator("a, button").evaluateAll((elements) =>
      elements
        .filter((element) => element.getBoundingClientRect().width > 0)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label: element.getAttribute("aria-label") || element.textContent,
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom,
            headerBottom: element.closest("header")!.getBoundingClientRect()
              .bottom,
            viewport: innerWidth,
          };
        }),
    );
    expect(bounds.length).toBeGreaterThan(5);
    for (const target of bounds) {
      expect(target.left, String(target.label)).toBeGreaterThanOrEqual(0);
      expect(target.right, String(target.label)).toBeLessThanOrEqual(
        target.viewport,
      );
      expect(target.bottom, String(target.label)).toBeLessThanOrEqual(
        target.headerBottom,
      );
    }
    const scrollPosition = () =>
      page.evaluate(() =>
        Math.max(
          window.scrollY,
          document.documentElement.scrollTop,
          document.body.scrollTop,
        ),
      );
    const scrollTo = (top: number) =>
      page.evaluate((value) => {
        const bodyScrolls =
          document.body.scrollTop > 0 ||
          /auto|scroll/.test(getComputedStyle(document.body).overflowY);
        const root = bodyScrolls ? document.body : document.scrollingElement!;
        root.scrollTo({ top: value, behavior: "instant" });
      }, top);
    // This checks scroll-driven layout, not wheel/touch input. Mobile WebKit
    // cannot dispatch Playwright wheel events; wait for actual scroll positions.
    await scrollTo(1200);
    await expect.poll(scrollPosition).toBeGreaterThanOrEqual(1000);
    // Let scroll observers paint the downward state before reversing direction.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const down = await scrollPosition();
    await scrollTo(down - 100);
    await expect.poll(scrollPosition).toBeLessThanOrEqual(down - 24);
    const floating = page.getByRole("region", {
      name: "Search and filters while browsing",
    });
    await expect(floating).toBeVisible();
    const headerBox = await header.boundingBox();
    const floatingBox = await floating.boundingBox();
    expect(floatingBox!.y).toBeGreaterThanOrEqual(
      headerBox!.y + headerBox!.height - 1,
    );
    await page.screenshot({
      path: testInfo.outputPath("topnav-css-scale-200.png"),
    });
    const tools = header.getByRole("link", { name: "All tools" });
    await tools.focus();
    await expect(tools).toBeFocused();
    await tools.click();
    await expect(page).toHaveURL(/\/tools(?:\?|$)/);
  });
});
