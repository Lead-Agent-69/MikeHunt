import { expect, test, type Page } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";
const dealId = "00000000-0000-4000-8000-000000000731";
async function open(page: Page, mode = "reseller", kind = "asking") {
  await page.route("**/api/preferences", (route) =>
    route.fulfill({
      json: { authed: true, prefs: { buyerScope: { buyerMode: mode } } },
    }),
  );
  await page.route(`**/api/deals/${dealId}**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path !== `/api/deals/${dealId}`)
      return route.fulfill({ json: path.endsWith("price-history") ? [] : {} });
    return route.fulfill({
      json: {
        deal: {
          id: dealId,
          year: 2020,
          make: "Ford",
          model: "Escape",
          title: "2020 Ford Escape",
          source: "cars_com",
          sourceUrl: "https://www.cars.com/vehicledetail/731/",
          lastSeenAt: new Date().toISOString(),
          askPrice: 10000,
          sellEstimate: 16000,
          mileage: 60000,
          locationCity: "Saint Louis",
          locationState: "MO",
          images: [],
          priceEvidence:
            kind === "asking"
              ? { kind, askingPrice: 10000 }
              : { kind, listedAmount: 10000 },
          dealAnalysis: { valuation: { resaleEvidence: false } },
          decisionEvidence: {
            state: "needs_evidence",
            label: "Needs evidence",
            summary: "Verify condition and quotes.",
            nextCheck: "Inspect the vehicle.",
            acquisitionReady: false,
          },
        },
      },
    });
  });
  await page.goto(`/deal/${dealId}`);
  await expect(
    page.getByRole("heading", { name: "2020 Ford Escape", exact: true }),
  ).toBeVisible();
  await page
    .getByText("Costs, seller, and private notes", { exact: true })
    .click();
}
const fields = {
  purchase: "10000",
  resale: "16000",
  buyerFees: "500",
  buyerFeeRate: "5",
  taxTitle: "500",
  repair: "1000",
  transport: "300",
  holding: "200",
  sellingFees: "100",
  sellingFeeRate: "2",
  otherCosts: "400",
  targetProfit: "2000",
};
test.describe("flip scenario planner", () => {
  localOnly();
  test.use({ storageState: storagePath("reseller"), serviceWorkers: "block" });
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: complete costs, downside and saved draft work at viewport size`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(
        (value) => localStorage.setItem("theme", value),
        theme,
      );
      await open(page);
      const planner = page.getByTestId("flip-scenario");
      await expect(planner).toBeVisible();
      await expect(planner.getByTestId("scenario-profit")).toHaveCount(0);
      await planner
        .getByRole("button", { name: "Use asking price", exact: true })
        .click();
      await expect(
        planner.locator('[data-scenario-field="purchase"]'),
      ).toHaveValue("10000");
      await expect(
        planner.getByRole("button", { name: "Use resale estimate" }),
      ).toHaveCount(0);
      for (const [field, value] of Object.entries(fields))
        await planner.locator(`[data-scenario-field="${field}"]`).fill(value);
      await expect(planner.getByTestId("scenario-profit")).toHaveText("$2,180");
      await expect(planner.getByTestId("scenario-ceiling")).toHaveText(
        "$10,171.42",
      );
      await expect(planner.getByTestId("flip-scenario-result")).toContainText(
        "$412",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const inputs = await planner
        .locator("input")
        .evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect().height),
        );
      expect(inputs.every((height) => height >= 44)).toBe(true);
      if (info.project.name.startsWith("mobile")) {
        await planner.getByRole("button", { name: "Review results" }).click();
        await expect(planner.getByTestId("flip-scenario-result")).toBeFocused();
      }
      await planner
        .getByRole("button", { name: "Save draft on this device" })
        .click();
      await expect(planner.getByRole("status")).toContainText(
        "Recheck prices and quotes",
      );
      await planner
        .getByTestId("flip-scenario-result")
        .screenshot({ path: info.outputPath(`scenario-${theme}.png`) });
      await page.reload();
      await page
        .getByText("Costs, seller, and private notes", { exact: true })
        .click();
      await expect(planner.getByTestId("scenario-profit")).toHaveText("$2,180");
      await planner.locator('[data-scenario-field="repair"]').fill("");
      await expect(planner.getByTestId("scenario-profit")).toHaveCount(0);
      await planner.locator('[data-scenario-field="repair"]').fill("-1");
      await expect(
        planner.locator('[data-scenario-field="repair"]'),
      ).toHaveAttribute("aria-invalid", "true");
      await expect(
        planner.getByRole("button", { name: "Save draft on this device" }),
      ).toBeDisabled();
      await planner.getByRole("button", { name: "Clear scenario" }).click();
      await expect(
        planner.locator('[data-scenario-field="repair"]'),
      ).toHaveValue("");
      expect(errors).toEqual([]);
    });
  }
  test("a down payment is not copied into purchase price", async ({ page }) => {
    await open(page, "reseller", "down_payment");
    const planner = page.getByTestId("flip-scenario");
    await expect(planner).toBeVisible();
    await expect(planner.getByRole("button", { name: /^Use / })).toHaveCount(0);
    await expect(
      planner.locator('[data-scenario-field="purchase"]'),
    ).toHaveValue("");
  });
  test("personal desk stays focused on buying, without flip economics", async ({
    page,
  }) => {
    await open(page, "personal");
    await expect(page.getByTestId("flip-scenario")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Checks before purchase" }),
    ).toBeVisible();
  });
});
