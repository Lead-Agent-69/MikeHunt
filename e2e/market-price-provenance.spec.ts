import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";

test.describe("Market title and bid provenance", () => {
  localOnly();
  test.use({ storageState: storagePath("personal") });

  test("qualifies historical title claims and ended bids without mobile overflow", async ({
    page,
  }, info) => {
    await page.route("**/api/market/explore**", async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      const body = await response.json();
      const fixture = body.rows[0];
      expect(fixture).toBeTruthy();
      const rows = [undefined, "source_default", "listing"].map(
        (titleSource, index) => ({
          ...fixture,
          id: `00000000-0000-4000-8000-00000000000${index + 1}`,
          title: `2021 QA provenance ${index + 1}`,
          condition: "clean_title",
          titleSource,
          damageType: undefined,
          images: [],
          imageUrl: undefined,
          auctionEndAt: index === 0 ? "2020-01-01T12:00:00Z" : undefined,
          price:
            index === 0
              ? {
                  ...fixture.price,
                  kind: "current_bid",
                  label: "Last observed bid",
                  amount: 5000,
                  advertisedAmount: 5000,
                  cashPrice: null,
                }
              : fixture.price,
        }),
      );
      await route.fulfill({
        response,
        json: { ...body, rows, total: rows.length, hasMore: false },
      });
    });
    await page.goto("/market?mode=all");
    const cards = page
      .locator("article")
      .filter({ has: page.getByTestId("market-card-title") });
    await expect(cards).toHaveCount(3);
    await expect(
      cards.nth(0).getByText("Title unconfirmed", { exact: true }),
    ).toBeVisible();
    await expect(
      cards.nth(0).getByText(/Last observed bid; auction has ended/),
    ).toBeVisible();
    await expect(
      cards
        .nth(1)
        .getByText("Title unconfirmed (reported by source)", { exact: true }),
    ).toBeVisible();
    await expect(
      cards.nth(2).getByText("Clean title", { exact: true }),
    ).toBeVisible();
    await expect(cards.getByText(/Bidding is open/)).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    for (const card of await cards.all()) {
      const box = await card.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.x + box!.width).toBeLessThanOrEqual(
        info.project.use.viewport!.width + 1,
      );
    }
    await page.screenshot({
      path: info.outputPath("market-title-provenance.png"),
      fullPage: true,
    });
  });
});
