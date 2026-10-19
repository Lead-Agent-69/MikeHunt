import { openMarketArea, setMarketRadius } from "./support/market-area";
import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";

test.describe("mobile-first workspaces", () => {
  localOnly();
  test.use({
    storageState: storagePath("personal"),
    serviceWorkers: "block",
    actionTimeout: 15_000,
  });

  test("core layouts use the available screen and keep primary actions usable", async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const metrics: Record<string, unknown> = {};
    const width = page.viewportSize()!.width;
    const phone = width < 640;
    const compact = width < 1024;
    const capture = async (name: string) => {
      await expect(page.locator("main h1").first()).toBeAttached();
      const measurement = await page.evaluate(() => {
        const main = document.querySelector("main")!.getBoundingClientRect();
        const firstCard = document
          .querySelector("[data-market-vehicle]")
          ?.getBoundingClientRect();
        return {
          viewport: innerWidth,
          height: innerHeight,
          overflow: document.documentElement.scrollWidth - innerWidth,
          mainWidth: main.width,
          firstCard: firstCard && {
            x: firstCard.x,
            y: firstCard.y,
            width: firstCard.width,
            height: firstCard.height,
          },
        };
      });
      metrics[name] = measurement;
      expect(
        measurement.overflow,
        `${name}: document should not pan sideways`,
      ).toBeLessThanOrEqual(1);
      expect(measurement.mainWidth).toBeGreaterThanOrEqual(
        page.viewportSize()!.width * 0.95,
      );
      await page.screenshot({ path: info.outputPath(`${name}.png`) });
      await page.screenshot({
        path: info.outputPath(`${name}-full.png`),
        fullPage: true,
      });
    };
    await page.goto("/market?mode=all", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-market-vehicle]").first()).toBeVisible({
      timeout: 30_000,
    });
    const detailLinks = await page
      .locator('[data-market-vehicle] a[aria-label^="Open details for"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
    await capture("market");
    if (phone) {
      const search = await page
        .getByRole("textbox", { name: "Search make, model or VIN" })
        .boundingBox();
      expect(search!.width).toBeGreaterThan(width - 60);
      const first = await page
        .locator("[data-market-vehicle]")
        .first()
        .boundingBox();
      expect(first!.y).toBeLessThan(460);
      expect(page.viewportSize()!.height - 58 - first!.y).toBeGreaterThan(160);
      await page
        .getByRole("button", { name: "Search actions", exact: true })
        .click();
      await expect(
        page.getByRole("menuitem", { name: "Copy search link" }),
      ).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: "Reset filters" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    }
    if (compact) {
      const area = await openMarketArea(page);
      await area
        .getByRole("radio", { name: "Nearby", exact: true })
        .locator("..")
        .click();
      await page
        .getByLabel("Search location", { exact: true })
        .fill("invalid city");
      await expect(
        area.getByRole("button", { name: "Apply area" }),
      ).toBeDisabled();
      await expect(area.getByText(/Enter a five-digit ZIP/)).toBeVisible();
      await page.getByLabel("Search location", { exact: true }).fill("63304");
      await setMarketRadius(page, 150);
      await area.getByRole("button", { name: "Apply area" }).click();
      await expect(page.locator("#market-search-area-trigger")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(page).toHaveURL(/near=63304/);
      await openMarketArea(page);
      await area
        .getByRole("radio", { name: "Nationwide", exact: true })
        .locator("..")
        .click();
      await expect(area.getByRole("slider")).toHaveCount(0);
      await area.getByRole("button", { name: "Apply area" }).click();
      await expect(page.locator("#market-search-area-trigger")).toHaveText(
        "Nationwide",
      );
    }
    await page.getByRole("button", { name: /^Filters/ }).click();
    await expect(page.locator("#market-filter-panel")).toBeVisible();
    await capture("filters");
    if (compact) {
      const dialog = page.getByRole("dialog", {
        name: "Market filters",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((el) => el.contains(document.activeElement)),
      ).toBe(true);
      const done = dialog.getByRole("button", { name: /^Show .* listings$/ });
      const doneBox = await done.boundingBox();
      expect(doneBox!.height).toBeGreaterThanOrEqual(44);
      expect(doneBox!.y + doneBox!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height,
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /^Filters/ }),
      ).toBeFocused();
      await page.getByRole("button", { name: /^Filters/ }).click();
      if (phone) {
        await page
          .getByRole("combobox", {
            name: "Advertised price range",
            exact: true,
          })
          .selectOption({ index: 2 });
        const range = await page
          .getByRole("combobox", {
            name: "Advertised price range",
            exact: true,
          })
          .inputValue();
        await page.getByRole("button", { name: /^Show .* listings$/ }).click();
        await page.getByRole("button", { name: /^Filters/ }).click();
        await expect(
          page.getByRole("combobox", {
            name: "Advertised price range",
            exact: true,
          }),
        ).toHaveValue(range);
      }
      await page.getByRole("button", { name: /^Show .* listings$/ }).click();
      await expect(dialog).toHaveCount(0);
    }
    await page.goto(detailLinks[0], { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await capture("detail");
    const photos = await page
      .getByRole("region", { name: "Listing photos", exact: true })
      .boundingBox();
    const facts = await page
      .getByRole("complementary", { name: "Vehicle details and actions" })
      .boundingBox();
    if (phone) {
      expect(photos!.y).toBeLessThan(360);
      expect(facts!.y).toBeGreaterThan(photos!.y);
    } else if (width >= 1024) {
      expect(facts!.x).toBeGreaterThan(photos!.x + photos!.width);
      expect(Math.abs(facts!.y - photos!.y)).toBeLessThan(2);
    }
    for (const route of ["discover", "saved", "settings"]) {
      await page.goto(`/${route}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main h1").first()).toBeVisible();
      if (route === "discover")
        await expect(
          page.getByRole("region", { name: /vehicles$/ }).first(),
        ).toBeVisible({ timeout: 30_000 });
      if (route === "saved")
        await expect(
          page
            .getByText("Nothing saved yet", { exact: true })
            .or(page.locator('main a[href^="/deal/"]'))
            .first(),
        ).toBeVisible();
      await capture(route);
      if (route === "discover" && compact) {
        await page.getByRole("button", { name: /^Quick filters/ }).click();
        await expect(
          page.getByRole("textbox", { name: "Make", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("combobox", { name: "Lane", exact: true }),
        ).toBeVisible();
      }
    }
    if (detailLinks.length >= 2) {
      await page.goto(
        `/compare?ids=${detailLinks
          .slice(0, 2)
          .map((href) => href.split("/").pop())
          .join(",")}&from=saved`,
      );
      await expect(
        page.getByRole("region", { name: "Selected vehicle comparison" }),
      ).toBeVisible();
      if (phone) {
        const columns = page.locator('[data-comparison-column="mobile"]');
        await expect(columns).toHaveCount(2);
        const first = await columns.nth(0).boundingBox();
        const second = await columns.nth(1).boundingBox();
        expect(second!.x + second!.width).toBeLessThanOrEqual(width - 11);
        expect(first!.width).toBeGreaterThan(130);
        const checkbox = await page
          .getByRole("checkbox", { name: "Differences only" })
          .boundingBox();
        expect(checkbox!.height).toBe(22);
        expect(checkbox!.width).toBe(22);
      } else await expect(page.getByRole("table")).toBeVisible();
      await capture("compare");
      if (phone && detailLinks.length >= 4) {
        await page.goto(
          `/compare?ids=${detailLinks
            .slice(0, 4)
            .map((href) => href.split("/").pop())
            .join(",")}&from=saved`,
        );
        await expect(
          page.locator('[data-comparison-column="mobile"]'),
        ).toHaveCount(4);
        await expect(
          page.getByRole("button", { name: "Next vehicle", exact: true }),
        ).toBeVisible();
        await page
          .getByRole("combobox", { name: "Comparison vehicle", exact: true })
          .selectOption({ index: 3 });
        await expect
          .poll(() =>
            page
              .getByRole("region", { name: "Selected vehicle comparison" })
              .evaluate((el) => el.scrollLeft),
          )
          .toBeGreaterThan(0);
        await expect(
          page.getByRole("combobox", {
            name: "Comparison vehicle",
            exact: true,
          }),
        ).toHaveValue(detailLinks[3].split("/").pop()!);
        await capture("compare-four");
      }
    }
    if (info.project.name === "desktop") {
      for (const wide of [1920, 2560]) {
        await page.setViewportSize({ width: wide, height: 1080 });
        for (const [route, label] of [
          ["/market?mode=all", "market"],
          [detailLinks[0], "detail"],
          ["/saved", "saved"],
        ]) {
          await page.goto(route, { waitUntil: "domcontentloaded" });
          await expect(page.locator("main h1").first()).toBeVisible();
          if (label === "saved")
            await expect(
              page
                .getByText("Nothing saved yet", { exact: true })
                .or(page.locator('main a[href^="/deal/"]'))
                .first(),
            ).toBeVisible();
          if (label === "market")
            await expect(
              page.locator("[data-market-vehicle]").first(),
            ).toBeVisible();
          await capture(`${label}-${wide}`);
          if (label === "detail")
            expect(
              (await page.getByTestId("vehicle-overview").boundingBox())!.width,
            ).toBeGreaterThan(wide * 0.95);
        }
      }
    }
    expect(errors).toEqual([]);
    await info.attach("layout-metrics", {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    });
  });
});
