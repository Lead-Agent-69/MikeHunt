import { expect, test } from "@playwright/test";
import { storagePath, type Desk } from "./support/accounts";
import { localOnly } from "./support/target";

const uuid = (n: number) =>
  `00000000-0000-0000-0000-${n.toString().padStart(12, "0")}`;
for (const desk of ["personal", "reseller", "dealer", "parts"] as Desk[]) {
  test.describe(`${desk} saved paging (local only)`, () => {
    localOnly();
    test.use({ storageState: storagePath(desk) });
    test("all statuses stay visible and older-page failure is recoverable", async ({
      page,
    }) => {
      const identity = await (
        await page.request.get("/api/auth/whoami")
      ).json();
      expect(identity.id).toBeTruthy();
      expect(identity.isAdmin).toBe(false);
      const rows = Array.from({ length: 50 }, (_, n) => ({
        id: uuid(n + 1),
        deal_id: uuid(n + 1),
        saved_at: "2026-10-12T00:00:00Z",
        status: n === 0 ? "watching" : n === 1 ? "archived" : "active",
        source_name: "web-share",
        source_url: "",
        price_at_save: 10000,
        last_price_seen: 10000,
        snapshot: {
          year: 2020,
          make: "Honda",
          model: `PagingFixture${n + 1}`,
          askingPrice: 10000,
          titleType: "clean",
          source: "web-share",
        },
      }));
      let olderRequests = 0;
      await page.route("**/api/saved-cars?view=page&**", async (route) => {
        expect(route.request().headers()["x-save-owner"]).toBe(identity.id);
        const cursor = new URL(route.request().url()).searchParams.get(
          "cursor",
        );
        if (cursor && ++olderRequests === 1) {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "fixture outage" }),
          });
          return;
        }
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            ownerId: identity.id,
            rows: cursor
              ? [
                  {
                    ...rows[0],
                    id: uuid(51),
                    deal_id: uuid(51),
                    snapshot: { ...rows[0].snapshot, model: "OlderFixture" },
                  },
                ]
              : rows,
            nextCursor: cursor
              ? null
              : JSON.stringify({
                  id: uuid(50),
                  savedAt: "2026-10-12T00:00:00Z",
                }),
          }),
        });
      });
      await page.goto("/saved");
      await expect(
        page.getByText("2020 Honda PagingFixture1", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByText("2020 Honda PagingFixture2", { exact: true }).first(),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Load more saved vehicles" })
        .click();
      await expect(
        page.getByText(
          "Older saves could not be loaded. Your loaded vehicles remain available.",
        ),
      ).toBeVisible();
      await expect(
        page.getByText("2020 Honda PagingFixture1", { exact: true }).first(),
      ).toBeAttached();
      await page.getByRole("button", { name: "Retry loading more" }).click();
      await expect(
        page.getByText("2020 Honda OlderFixture", { exact: true }).first(),
      ).toBeAttached();
      await expect(
        page.getByRole("button", { name: "Load more saved vehicles" }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
    });
  });
}
