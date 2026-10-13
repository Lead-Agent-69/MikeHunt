import { expect, test, type Page } from "@playwright/test";
import { storagePath, type Desk } from "./support/accounts";
import { localOnly } from "./support/target";
import { pickDeal } from "./support/deals";

const context = (kind: string, amount: number) => ({
  kind,
  amount,
  advertisedAmount: amount,
  cashPrice: kind === "asking" ? amount : null,
  observationCurrent: true,
  canCompareToAskingCurve: kind === "asking",
  label: (
    {
      asking: "Asking price",
      current_bid: "Current bid",
      monthly_payment: "Monthly payment",
      unknown: "Unverified advertised amount",
    } as Record<string, string>
  )[kind],
});
let comparisonIds: string[] = [];
async function open(page: Page, mode: "cash" | "advertised" | "truncated") {
  const deal = await pickDeal(page.request);
  const requests = { sources: 0, similar: 0 };
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === `/api/deals/${deal.id}/sources`) requests.sources++;
    if (path === `/api/deals/${deal.id}/similar`) requests.similar++;
  });
  if (!comparisonIds.length) {
    const response = await page.request.get("/api/deals?limit=8");
    if (!response.ok())
      throw new Error("Local comparison inventory unavailable");
    const body = await response.json();
    comparisonIds = body.deals
      .map((row: { id: string }) => row.id)
      .filter((id: string) => id !== deal.id)
      .slice(0, 6);
    if (comparisonIds.length < 6)
      throw new Error("Six local comparison rows are required");
  }
  const rows = [
    "asking",
    "asking",
    "current_bid",
    "monthly_payment",
    "unknown",
  ].map((kind, i) => ({
    id: `observation-${i}`,
    source: "independent_dealer",
    url: `https://seller.example/car/${i}`,
    state: "MO",
    askPrice: [14000, 18000, 400, 250, 500][i],
    priceContext: context(kind, [14000, 18000, 400, 250, 500][i]),
  }));
  await page.route(`**/api/deals/${deal.id}/sources`, (route) =>
    route.fulfill({
      json: {
        base: {
          make: "Honda",
          model: "Accord",
          year: 2018,
          mileage: 50000,
          cashPrice: 14000,
          canCompareToAskingCurve: true,
          priceContext: context("asking", 14000),
        },
        sources: rows,
        count: 5,
        hasMore: mode === "truncated",
        comparableCount: 2,
        cheapest: mode === "truncated" ? null : 14000,
        dearest: mode === "truncated" ? null : 18000,
      },
    }),
  );
  await page.route(`**/api/deals/${deal.id}/similar`, (route) =>
    route.fulfill({
      json: {
        similar: Array.from({ length: 6 }, (_, i) => ({
          id: comparisonIds[i],
          make: "Honda",
          model: "Accord",
          year: 2018,
          mileage: 20000 + i * 10000,
          askPrice: 20000 - i * 1000,
          source: "independent_dealer",
          priceContext: context(
            mode === "cash" ? "asking" : "unknown",
            20000 - i * 1000,
          ),
        })),
      },
    }),
  );
  for (const endpoint of ["depreciation", "snapshot", "sold"])
    await page.route(`**/api/market/${endpoint}?**`, (route) =>
      route.fulfill({ json: {} }),
    );
  await page.goto(`/deal/${deal.id}`);
  await expect(page.locator("h1").first()).toBeVisible();
  await page.getByText("Compare price and timing", { exact: true }).click();
  await expect(page.getByText(/5\+? reported listings/)).toBeVisible();
  return { dealId: deal.id, comparisonIds, requests };
}
test.describe("price panels in both themes", () => {
  localOnly();
  test.use({ storageState: storagePath("personal"), serviceWorkers: "block" });
  for (const theme of ["light", "dark"]) {
    test(`${theme} uses readable theme surfaces`, async ({ page }, info) => {
      if (info.project.name === "mobile-390")
        await page.setViewportSize({ width: 320, height: 844 });
      await page.addInitScript(
        (value) => localStorage.setItem("theme", value),
        theme,
      );
      await open(page, "cash");
      const seasonal = page
        .getByText("Seasonal context", { exact: true })
        .locator("xpath=ancestor::div[contains(@class,'glass-panel')][1]");
      await seasonal.scrollIntoViewIfNeeded();
      expect(
        await seasonal.evaluate((element) => {
          const style = getComputedStyle(element);
          const reference = document.createElement("div");
          reference.style.backgroundColor = "var(--s0)";
          element.append(reference);
          const expected = getComputedStyle(reference).backgroundColor;
          reference.remove();
          return style.backgroundColor === expected;
        }),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await seasonal.screenshot({
        path: info.outputPath(`seasonal-${theme}.png`),
      });
      const chart = page.getByRole("group", {
        name: "Comparable asking prices by mileage",
      });
      const amountBox = (await page
        .getByRole("spinbutton", { name: "Maximum amount ($)", exact: true })
        .boundingBox())!;
      const mileageBox = (await page
        .getByRole("spinbutton", { name: "Maximum mileage", exact: true })
        .boundingBox())!;
      expect(Math.abs(amountBox.y - mileageBox.y)).toBeLessThanOrEqual(1);
      expect(amountBox.height).toBeGreaterThanOrEqual(44);
      await chart.evaluate((element) =>
        element.scrollIntoView({ block: "center", behavior: "instant" }),
      );
      const headerBox = (await page.getByRole("banner").boundingBox())!;
      await expect
        .poll(async () => (await chart.boundingBox())!.y)
        .toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
      await chart.screenshot({
        path: info.outputPath(`comparison-${theme}.png`),
      });
    });
  }
});
for (const desk of ["personal", "reseller", "dealer", "parts"] as Desk[]) {
  test.describe(`${desk} price meaning`, () => {
    localOnly();
    test.use({ storageState: storagePath(desk), serviceWorkers: "block" });
    test("chart selection works with touch, keyboard and real comparison links", async ({
      page,
    }, info) => {
      const fixture = await open(page, "advertised");
      const chart = page.getByRole("group", {
        name: "Advertised amounts by mileage",
      });
      const dots = chart.getByRole("button", { name: /^Inspect / });
      if (info.project.name === "mobile-390") await dots.nth(2).tap();
      else await dots.nth(2).click();
      await expect(
        page.getByRole("combobox", { name: "Selected vehicle" }),
      ).toHaveValue(fixture.comparisonIds[2]);
      await dots.nth(1).focus();
      await dots.nth(1).press("Space");
      await expect(dots.nth(1)).toHaveAttribute("aria-pressed", "true");
      const selector = page.getByRole("combobox", { name: "Selected vehicle" });
      await selector.focus();
      await selector.selectOption(fixture.comparisonIds[0]);
      expect(fixture.requests).toEqual({ sources: 1, similar: 1 });
      const view = page.getByRole("link", {
        name: "Open vehicle",
        exact: true,
      });
      const compare = page.getByRole("link", {
        name: "Compare with this vehicle",
        exact: true,
      });
      await expect(view).toHaveAttribute(
        "href",
        `/deal/${fixture.comparisonIds[0]}`,
      );
      await expect(compare).toHaveAttribute(
        "href",
        `/compare?ids=${fixture.dealId},${fixture.comparisonIds[0]}&from=${fixture.dealId}`,
      );
      for (const control of [selector, view, compare])
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(
          44,
        );
      await selector.evaluate((element) =>
        element.scrollIntoView({ block: "center", behavior: "instant" }),
      );
      await page.screenshot({
        path: info.outputPath("interactive-comparison.png"),
      });
      if (info.project.name === "mobile-390")
        await page.setViewportSize({ width: 320, height: 844 });
      await compare.click();
      await expect(page).toHaveURL(
        new RegExp(
          `/compare\\?ids=${fixture.dealId},${fixture.comparisonIds[0]}`,
        ),
      );
      await expect(
        page.getByRole("heading", { name: "Compare Vehicles", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("table").first()).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Back to vehicle", exact: true }),
      ).toHaveAttribute("href", `/deal/${fixture.dealId}`);
      await expect(
        page.getByRole("link", { name: "Back to Saved", exact: true }),
      ).toHaveCount(0);
      if (info.project.name === "mobile-390") {
        const region = page.getByRole("region", {
          name: "Selected vehicle comparison",
          exact: true,
        });
        const selector = page.getByRole("combobox", {
          name: "Comparison vehicle",
          exact: true,
        });
        await expect(selector).toBeVisible();
        const feature = region.locator('tbody th[scope="row"]').first();
        const featureX = (await feature.boundingBox())!.x;
        const next = page.getByRole("button", {
          name: "Next vehicle",
          exact: true,
        });
        expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await next.tap();
        await expect(selector).toHaveValue(fixture.comparisonIds[0]);
        await expect
          .poll(() => region.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(0);
        expect(
          Math.abs((await feature.boundingBox())!.x - featureX),
        ).toBeLessThanOrEqual(2);
        const second = (await region
          .locator('thead th[scope="col"]')
          .nth(1)
          .boundingBox())!;
        const bounds = (await region.boundingBox())!;
        expect(second.x + second.width).toBeLessThanOrEqual(
          bounds.x + bounds.width + 2,
        );
        await page
          .getByRole("button", { name: "Previous vehicle", exact: true })
          .tap();
        await expect(selector).toHaveValue(fixture.dealId);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath("vehicle-comparison.png"),
        fullPage: true,
      });
      await page.goto(`/deal/${fixture.comparisonIds[0]}`);
      await expect(page.locator("h1").first()).toBeVisible();
    });
    test("comparison limits reset cleanly without grading sparse or empty results", async ({
      page,
    }) => {
      const fixture = await open(page, "cash");
      const miles = page.getByRole("spinbutton", {
        name: "Maximum mileage",
        exact: true,
      });
      const amount = page.getByRole("spinbutton", {
        name: "Maximum amount ($)",
        exact: true,
      });
      await miles.fill("40000");
      await expect(
        page.getByText("3 of 6 loaded comparisons", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("group", {
          name: "Comparable asking prices by mileage",
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("combobox", { name: "Selected vehicle" }),
      ).toBeVisible();
      await amount.fill("10000");
      await expect(
        page.getByText("No loaded comparisons match these limits.", {
          exact: true,
        }),
      ).toBeVisible();
      await miles.fill("-1");
      await expect(
        page.getByText(
          "Use a non-negative number. These limits have not been applied.",
          { exact: true },
        ),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Reset comparison filters", exact: true })
        .click();
      await expect(miles).toHaveValue("");
      await expect(amount).toHaveValue("");
      expect(fixture.requests).toEqual({ sources: 1, similar: 1 });
      await expect(
        page.getByText("6 of 6 loaded comparisons", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("group", {
          name: "Comparable asking prices by mileage",
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
    test("mixed prices retain their meaning without payment-driven savings", async ({
      page,
    }, info) => {
      await open(page, "cash");
      await expect(
        page.getByText("Reported asking / buy-now range:", { exact: false }),
      ).toContainText("$14,000");
      await expect(
        page.getByText("Current bid", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Monthly payment", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("group", {
          name: "Comparable asking prices by mileage",
        }),
      ).toBeVisible();
      for (const name of ["Cash prices", "Advertised amounts"]) {
        const button = page.getByRole("button", { name, exact: true });
        await button.scrollIntoViewIfNeeded();
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath("price-context.png"),
        fullPage: true,
      });
    });
    test("research advertisements remain usable without a false cash verdict", async ({
      page,
    }) => {
      await open(page, "advertised");
      await expect(
        page.getByRole("group", { name: "Advertised amounts by mileage" }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Price terms may be unverified; this is not a cash-price comparison.",
          { exact: false },
        ),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Cash prices", exact: true })
        .click();
      await expect(
        page.getByText("Not enough comparable asking prices with mileage", {
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Advertised amounts", exact: true })
        .click();
      await expect(
        page.getByRole("group", { name: "Advertised amounts by mileage" }),
      ).toBeVisible();
    });
    test("an incomplete source sample never presents a full price range", async ({
      page,
    }) => {
      await open(page, "truncated");
      await expect(
        page.getByText(
          "Showing the 50 latest observations; no complete price range is established.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page.getByText("Reported asking / buy-now range:", { exact: false }),
      ).toHaveCount(0);
    });
  });
}
