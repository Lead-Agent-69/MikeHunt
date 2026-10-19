import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";
import { openMarketArea, setMarketRadius } from "./support/market-area";

test.describe("consolidated search area", () => {
  localOnly();
  test.use({
    storageState: storagePath("personal"),
    serviceWorkers: "block",
    actionTimeout: 15_000,
  });
  test("keeps Nationwide, Nearby and States mutually exclusive across every entry point", async ({
    page,
    context,
  }, info) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/market?mode=all&q=Ford", {
      waitUntil: "domcontentloaded",
    });
    const trigger = page.locator("#market-search-area-trigger");
    await expect(trigger).toHaveText("Nationwide");
    const header = page.locator("header").first();
    await header
      .getByRole("button", {
        name: "Change search area: Nationwide",
        exact: true,
      })
      .filter({ visible: true })
      .click();
    const area = page.getByRole("dialog", { name: "Search area", exact: true });
    await expect(
      area.getByRole("radio", { name: "Nationwide", exact: true }),
    ).toBeChecked();
    await expect(area.getByRole("slider")).toHaveCount(0);
    await expect(
      area.getByRole("textbox", { name: "Search location", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("nationwide.png") });
    await area
      .getByRole("radio", { name: "Nearby", exact: true })
      .locator("..")
      .click();
    await area
      .getByLabel("Search location", { exact: true })
      .fill("invalid city");
    await expect(
      area.getByRole("button", { name: "Apply area" }),
    ).toBeDisabled();
    await area.getByLabel("Search location", { exact: true }).fill("63304");
    await setMarketRadius(page, 150);
    await expect(page).not.toHaveURL(/near=/);
    await area.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(trigger).toHaveText("Nationwide");
    await openMarketArea(page);
    await area
      .getByRole("radio", { name: "Nearby", exact: true })
      .locator("..")
      .click();
    await area.getByLabel("Search location", { exact: true }).fill("63304");
    await setMarketRadius(page, 150);
    await page.screenshot({ path: info.outputPath("nearby.png") });
    const box = await area
      .getByRole("button", { name: "Apply area" })
      .boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.y + box!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
    await area.getByRole("button", { name: "Apply area" }).click();
    await expect
      .poll(() => Object.fromEntries(new URL(page.url()).searchParams))
      .toMatchObject({ near: "63304", radius: "150", q: "Ford", page: "0" });
    await expect(trigger).toHaveText("Within 150 mi of 63304");
    await expect(
      header
        .getByRole("button", {
          name: "Change search area: Within 150 mi of 63304",
        })
        .filter({ visible: true }),
    ).toBeVisible();
    await page
      .getByLabel("Sort market results")
      .selectOption("distanceMiles:asc");
    await page.reload();
    await expect(trigger).toHaveText("Within 150 mi of 63304");
    await openMarketArea(page);
    await area
      .getByRole("radio", { name: "Nationwide", exact: true })
      .locator("..")
      .click();
    await expect(area.getByRole("slider")).toHaveCount(0);
    await area.getByRole("button", { name: "Apply area" }).click();
    await expect
      .poll(() => Object.fromEntries(new URL(page.url()).searchParams))
      .toMatchObject({ sort: "lastSeenAt", q: "Ford", page: "0" });
    for (const key of ["near", "radius", "lat", "lng", "states"])
      expect(new URL(page.url()).searchParams.has(key)).toBe(false);
    await openMarketArea(page);
    await expect(area.getByRole("slider")).toHaveCount(0);
    await area
      .getByRole("radio", { name: "States", exact: true })
      .locator("..")
      .click();
    await area.getByRole("checkbox", { name: /^Missouri/ }).check();
    await area.getByRole("checkbox", { name: /^Illinois/ }).check();
    await page.screenshot({ path: info.outputPath("states.png") });
    await area.getByRole("button", { name: "Apply area" }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("states"))
      .toBe("MO,IL");
    await expect(trigger).toHaveText("MO, IL");
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page
      .getByTestId("exact-market-filters")
      .locator("summary")
      .first()
      .click();
    await page
      .getByRole("button", { name: "Edit search area", exact: true })
      .click();
    await expect(area).toBeVisible();
    await expect(
      area.getByRole("radio", { name: "States", exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole("dialog", { name: "Market filters", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 38.6, longitude: -90.2 });
    await openMarketArea(page);
    await area
      .getByRole("radio", { name: "Nearby", exact: true })
      .locator("..")
      .click();
    await area
      .getByRole("button", { name: "Use my location", exact: true })
      .click();
    await expect(area.getByRole("status")).toContainText(
      "Using your current location",
    );
    await area.getByRole("button", { name: "Apply area" }).click();
    await expect
      .poll(() => Object.fromEntries(new URL(page.url()).searchParams))
      .toMatchObject({ lat: "38.6", lng: "-90.2" });
    expect(new URL(page.url()).searchParams.has("states")).toBe(false);
    expect(new URL(page.url()).searchParams.has("near")).toBe(false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});
