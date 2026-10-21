import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";

test.describe("inventory account confirmations", () => {
  localOnly();
  test.use({ storageState: storagePath("reseller"), serviceWorkers: "block" });
  test("purchase, stage updates and account guards use the same owner contract", async ({
    page,
    browser,
  }, info) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    expect(["127.0.0.1", "localhost", "[::1]"]).toContain(
      new URL(url).hostname,
    );
    const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const identity = await page.request.get("/api/outcomes");
    expect(identity.ok()).toBe(true);
    const { ownerId } = await identity.json();
    expect(ownerId).toBeTruthy();
    const headers = { "x-inventory-owner": ownerId };
    const model = `Inventory QA ${info.project.name} ${Date.now()}`;
    const purchaseDate = new Date().toISOString().slice(0, 10);
    const id = randomUUID();
    const other = await browser.newContext({
      storageState: storagePath("dealer"),
    });
    try {
      const created = await page.request.post("/api/inventory", {
        headers,
        data: {
          id,
          purchaseDate,
          year: 2020,
          make: "QA",
          model,
          condition: "unknown",
          purchasePrice: 1000.25,
          stage: "acquired",
        },
      });
      expect(created.status()).toBe(200);
      const confirmed = await created.json();
      expect(confirmed.item.id).toBe(id);
      const replay = await page.request.post("/api/inventory", {
        headers,
        data: {
          id,
          purchaseDate,
          year: 2020,
          make: "QA",
          model,
          condition: "unknown",
          purchasePrice: 1000.25,
        },
      });
      expect(replay.ok()).toBe(true);
      expect(await replay.json()).toMatchObject({
        replayed: true,
        item: { id },
      });
      const changed = await page.request.post("/api/inventory", {
        headers,
        data: {
          id,
          purchaseDate,
          year: 2020,
          make: "QA",
          model,
          purchasePrice: 2000,
        },
      });
      expect(changed.status()).toBe(409);
      const storedOutcome = await db
        .from("deal_outcomes")
        .select("id,costs_complete")
        .eq("inventory_id", id)
        .eq("user_id", ownerId);
      expect(storedOutcome.error).toBeNull();
      expect(storedOutcome.data).toEqual([{ id, costs_complete: false }]);
      expect(confirmed).toMatchObject({
        ownerId,
        item: { dealerId: ownerId, purchasePrice: 1000.25, stage: "acquired" },
      });
      expect(confirmed.item).not.toHaveProperty("dealer_id");
      for (const method of ["get", "post", "patch"] as const) {
        const rejected = await other.request[method]("/api/inventory", {
          headers,
          ...(method === "get"
            ? {}
            : { data: { id, stage: "recon", purchasePrice: 1000 } }),
        });
        expect(rejected.status()).toBe(409);
      }
      const otherInventory = await other.request.get("/api/inventory");
      expect(otherInventory.ok()).toBe(true);
      expect(
        (await otherInventory.json()).items.some(
          (item: { id: string }) => item.id === id,
        ),
      ).toBe(false);
      const stage = await page.request.patch("/api/inventory", {
        headers,
        data: { id, stage: "recon" },
      });
      expect(stage.ok()).toBe(true);
      expect(await stage.json()).toMatchObject({
        ownerId,
        item: { id, dealerId: ownerId, stage: "recon" },
      });
      // Prime Pipeline, then use actual client navigation to expose stale shared-cache bugs.
      await page.goto("/fleet");
      await expect(
        page.getByText(model, { exact: false }).first(),
      ).toBeVisible();
      const navigationOrigin = await page.evaluate(
        () => performance.timeOrigin,
      );
      await page.locator('a[href="/tools"]:visible').first().click();
      await expect(
        page.getByRole("heading", { name: "Tools", exact: true }),
      ).toBeVisible();
      await page.locator('a[href="/recon"]:visible').first().click();
      const heading = page.getByRole("heading", { name: `2020 QA ${model}` });
      await expect(heading).toBeVisible();
      const card = page.getByRole("article").filter({ has: heading });
      await expect(card).toContainText("Estimated Carrying Cost");
      await card
        .getByRole("button", { name: /Move to Listed|Mark Repair Done/ })
        .click();
      await expect(heading).toHaveCount(0);
      await page.locator('a[href="/fleet"]:visible').first().click();
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(
        navigationOrigin,
      );
      await expect(
        page.getByRole("button", { name: /Advance to Offer/ }),
      ).toBeVisible();
      await expect(
        page.getByText(model, { exact: false }).first(),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 2,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.vercel/account-pipeline-${info.project.name}.png`,
        fullPage: true,
      });
      const stored = await page.request.get("/api/inventory", { headers });
      expect(
        (await stored.json()).items.find(
          (item: { id: string }) => item.id === id,
        ),
      ).toMatchObject({ dealerId: ownerId, stage: "listed" });
    } finally {
      await other.close();
      if (id) {
        await db
          .from("deal_outcomes")
          .delete()
          .eq("inventory_id", id)
          .eq("user_id", ownerId);
        const cleanup = await db
          .from("inventory")
          .delete()
          .eq("id", id)
          .eq("dealer_id", ownerId);
        expect(cleanup.error).toBeNull();
      }
    }
  });
});
