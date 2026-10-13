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
async function open(page: Page, mode: "cash" | "advertised" | "truncated") {
  const deal = await pickDeal(page.request);
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
          id: `comp-${i}`,
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
}
test.describe("price panels in both themes", () => {
  localOnly();
  test.use({ storageState: storagePath("personal"), serviceWorkers: "block" });
  for (const theme of ["light", "dark"]) {
    test(`${theme} uses readable theme surfaces`, async ({ page }, info) => {
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
      const chart = page.getByRole("img", {
        name: "Comparable asking prices by mileage",
      });
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
        page.getByRole("img", { name: "Comparable asking prices by mileage" }),
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
        page.getByRole("img", { name: "Advertised amounts by mileage" }),
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
        page.getByRole("img", { name: "Advertised amounts by mileage" }),
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
