import { openMarketArea, setMarketRadius } from "./support/market-area";
import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";

test.describe("Market search preview and radius", () => {
  localOnly();
  test.use({ storageState: storagePath("personal"), serviceWorkers: "block" });

  test("previews constraints, rejects unsafe interpretations and preserves applied filters in a reloadable URL", async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      "/market?mode=all&near=63304&radius=100&makes=Ford&model=Explorer",
      { waitUntil: "domcontentloaded" },
    );
    const trigger = page.getByRole("button", {
      name: "Describe a vehicle search",
    });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: "Describe a search",
      exact: true,
    });
    const words = dialog.getByRole("textbox", {
      name: "What are you looking for?",
    });
    const apply = dialog.getByRole("button", { name: "Apply search filters" });
    await expect(dialog).toBeVisible();
    await words.fill("Ford $299 per month");
    await expect(apply).toBeDisabled();
    await expect(
      dialog.getByText(/Payment and financing amounts/),
    ).toBeVisible();
    await words.fill("Ford no accidents");
    await expect(apply).toBeDisabled();
    await words.fill("FORD IN TX");
    await expect(apply).toBeEnabled();
    await expect(dialog.getByText("Texas", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Indiana", { exact: true })).toHaveCount(0);
    await words.fill(
      "Ford F150 2018-2022 flex fuel manual 4WD under $25k near 63304 within 75 miles",
    );
    await expect(apply).toBeEnabled();
    const chips = dialog.getByRole("region", {
      name: "Interpreted search filters",
    });
    for (const text of [
      "Flex fuel",
      "Manual",
      "4WD",
      "F-150",
      "Year from 2018",
      "Year to 2022",
      "Full price up to $25,000",
      "75 mi radius",
    ])
      await expect(chips.getByText(text, { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    const applyBox = await apply.boundingBox();
    expect(applyBox!.height).toBeGreaterThanOrEqual(44);
    expect(applyBox!.y + applyBox!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
    await page.screenshot({
      path: info.outputPath("search-preview.png"),
      fullPage: true,
    });
    const response = page.waitForResponse(
      (r) =>
        r.url().includes("/api/market/explore?") &&
        r.url().includes("fuelType=Flex"),
    );
    await apply.click();
    expect((await response).status()).toBe(200);
    await expect(dialog).toHaveCount(0);
    const expected = {
      makes: "Ford",
      model: "F-150",
      yearMin: "2018",
      yearMax: "2022",
      fuelType: "Flex fuel",
      transmission: "Manual",
      drivetrain: "4WD",
      priceMax: "25000",
      priceBasis: "cash",
      pricePolicy: "reported",
      near: "63304",
      radius: "75",
      page: "0",
    };
    await expect
      .poll(() => Object.fromEntries(new URL(page.url()).searchParams))
      .toMatchObject(expected);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(trigger).toBeVisible();
    await expect
      .poll(() => Object.fromEntries(new URL(page.url()).searchParams))
      .toMatchObject(expected);
    await trigger.click();
    await words.fill("Toyota PHEV CVT");
    await expect(apply).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(new URL(page.url()).searchParams.get("makes")).toBe("Ford");

    if (page.viewportSize()!.width < 1024) {
      const area = await openMarketArea(page);
      await setMarketRadius(page, 10);
      await area.getByRole("button", { name: "Apply area" }).click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("radius"))
        .toBe("10");
      await openMarketArea(page);
      await area
        .getByRole("radio", { name: "Nationwide", exact: true })
        .locator("..")
        .click();
      await area.getByRole("button", { name: "Apply area" }).click();
      await expect
        .poll(() => new URL(page.url()).searchParams.has("near"))
        .toBe(false);
    }
    const powertrainResponse = await page.request.get(
      "/api/market/explore?mode=all&fuelType=PHEV&transmission=CVT&drivetrain=FWD",
    );
    expect(powertrainResponse.status(), await powertrainResponse.text()).toBe(
      200,
    );
    expect(errors).toEqual([]);
  });
});
