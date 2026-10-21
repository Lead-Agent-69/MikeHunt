import { expect, test } from "@playwright/test";
import { completeSale } from "../lib/outcomes/ledger.fixture";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";

test.describe("Pipeline financial evidence", () => {
  localOnly();
  test.use({ storageState: storagePath("reseller"), serviceWorkers: "block" });
  test("reviewed net, zero proceeds, sale-review handoff and phone layout", async ({
    page,
  }, info) => {
    const identity = await page.request.get("/api/outcomes");
    expect(identity.ok()).toBe(true);
    const { ownerId } = await identity.json();
    expect(ownerId).toBeTruthy();
    const base = {
      dealerId: ownerId,
      vin: "",
      year: 2020,
      make: "Honda",
      model: "Civic",
      condition: "clean",
      purchasePrice: 10000,
      auctionFee: 0,
      transportCost: 0,
      repairCost: 0,
      reconCost: 0,
      titleFee: 0,
      holdingCost: 0,
      otherCosts: 0,
      totalCost: 10000,
      floorDate: "2026-09-01T00:00:00Z",
      dailyFloorRate: 35,
      photos: [],
      listedPlatforms: [],
      leadCount: 0,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    };
    let items = [
      {
        ...base,
        id: "sold-fixture",
        model: "Reviewed zero sale",
        stage: "sold",
        soldPrice: 0,
        soldDate: "2026-10-01T00:00:00Z",
      },
      {
        ...base,
        id: "offer-fixture",
        model: "Sale review handoff",
        stage: "offer",
        soldPrice: undefined,
        soldDate: undefined,
      },
    ];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/outcomes", async (route) =>
      route.fulfill({
        json: {
          ownerId,
          outcomes: [
            completeSale({
              id: "reviewed-fixture",
              user_id: ownerId,
              inventory_id: "sold-fixture",
              sell_price: 0,
            }),
          ],
        },
      }),
    );
    await page.route("**/api/inventory**", async (route) => {
      if (route.request().method() === "PATCH") {
        expect(route.request().headers()["x-inventory-owner"]).toBe(ownerId);
        expect(route.request().postDataJSON()).toMatchObject({
          id: "offer-fixture",
          stage: "sold",
          soldPrice: 0,
        });
        items = items.map((item) =>
          item.id === "offer-fixture"
            ? {
                ...item,
                stage: "sold",
                soldPrice: 0,
                soldDate: "2026-10-01T00:00:00Z",
              }
            : item,
        );
        return route.fulfill({
          json: {
            ownerId,
            item: items[1],
            outcomeReview: {
              synced: false,
              message:
                "Sale saved in Pipeline. Its outcome record needs review.",
            },
          },
        });
      }
      return route.fulfill({
        json: { ownerId, items, total: items.length, hasMore: false },
      });
    });
    await page.goto("/fleet");
    const metrics = page.getByRole("region", { name: "Pipeline metrics" });
    await expect(metrics).toContainText("Avg recorded net");
    await expect(metrics).toContainText("-$13,820");
    await expect(metrics).toContainText("1 reviewed sale");
    await page.getByRole("button", { name: /^Mark Sold/ }).click();
    const dialog = page.getByRole("dialog", { name: "Record vehicle sale" });
    await dialog.getByLabel("Actual sale price received ($)").fill("0");
    await expect(dialog).toContainText("Spread over inventory costs");
    await dialog.getByRole("button", { name: "Confirm Sale" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText("0 active units · $0/day modeled carry", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Modeled holding to date:", { exact: false }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Recorded inventory costs", { exact: true }),
    ).toHaveCount(2);

    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Its outcome record needs review" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.vercel/qa-pipeline-${info.project.name}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  });
});
