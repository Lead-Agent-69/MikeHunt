import { expect, test, type Page } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}

test.describe("Inventory freshness controls", () => {
  localOnly();
  test.use({
    storageState: storagePath("personal"),
    // Keep this UI contract deterministic instead of reading cached app shells.
    serviceWorkers: "block",
  });

  test("uses continuous Market browsing and preserves Feed research links", async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/market?mode=all&seenWithin=7");
    await expect(
      page.getByRole("combobox", { name: "Inventory freshness" }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/(?:\?|&)browse=1(?:&|$)/);
    await expect(page).not.toHaveURL(/seenWithin=/);

    const everydayFilters = page.getByRole("region", {
      name: "Everyday search filters",
    });
    const visibleControls = [
      everydayFilters.getByRole("textbox", { name: "Quick make" }),
      everydayFilters.getByRole("textbox", { name: "Quick model" }),
      everydayFilters.getByRole("spinbutton", { name: "Quick price up to" }),
      everydayFilters.getByRole("spinbutton", {
        name: "Quick mileage up to",
      }),
      everydayFilters.getByRole("combobox", {
        name: "Quick source or dealer",
      }),
      everydayFilters.getByRole("button", { name: "All filters" }),
    ];
    for (const control of visibleControls) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(
        testInfo.project.use.viewport!.width + 1,
      );
    }

    await expectNoHorizontalOverflow(page);

    await page.goto(
      "/feed?scope=explicit&seenWithin=30&hasPhotos=yes&state=all&makes=&q=&lane=all&sellerType=all&titleType=all&minPrice=&maxPrice=&dealers=&dealerSourceIds=",
    );
    const freshnessNav = page.getByRole("navigation", {
      name: "Inventory freshness",
    });
    await expect(freshnessNav).toBeVisible();
    const options = freshnessNav.getByRole("link");
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toContainText("Fresh");
    await expect(options.nth(1)).toContainText("Recent");
    await expect(options.nth(2)).toContainText("Archive");
    await expect(options.nth(2)).toHaveAttribute("aria-current", "true");

    for (const option of await options.all()) {
      const box = await option.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    const mapHref = await page
      .getByRole("navigation", { name: "Inventory views" })
      .getByRole("link", { name: "Map" })
      .getAttribute("href");
    expect(mapHref).toContain("seenWithin=30");
    expect(mapHref).toContain("scope=explicit");
    await expect(
      page.getByText(
        /Research history; recheck before relying on the listing.*Older observations never count as a current buying recommendation until refreshed/,
      ),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("feed-archive-inventory.png"),
    });
  });
});
