import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";

test.describe("purchase recording accuracy", () => {
  localOnly();
  test.use({ storageState: storagePath("dealer"), serviceWorkers: "block" });
  test("a lost acknowledgement retries the same purchase and keeps source photos and cents", async ({
    page,
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
    const listing = await db
      .from("deals")
      .select("id,year,make,model,images")
      .eq("active", true)
      .not("images", "is", null)
      .neq("images", "{}")
      .limit(1)
      .single();
    expect(listing.error).toBeNull();
    expect(listing.data?.images.length).toBeGreaterThan(0);
    const deal = listing.data!;
    const submissions: Record<string, any>[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let savedId: string | undefined;
    let dropped = false;
    try {
      await page.route("**/api/inventory", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const submitted = route.request().postDataJSON();
        submissions.push(submitted);
        savedId = submitted.id;
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        if (!dropped) {
          dropped = true;
          return route.abort("connectionreset");
        }
        expect((await response.json()).replayed).toBe(true);
        return route.fulfill({ response });
      });
      await page.goto(`/deal/${deal.id}`);
      await page
        .getByRole("button", { name: "Record purchase", exact: true })
        .first()
        .click();
      const form = page.getByRole("dialog", {
        name: "Record vehicle purchase",
      });
      await form.getByLabel("Purchase price paid ($)").fill("8750.25");
      await form
        .getByLabel("Purchase date", { exact: true })
        .fill("2026-01-15");
      await form
        .getByRole("button", { name: "Confirm purchase record" })
        .click();
      await expect(form.getByRole("alert")).toBeVisible();
      await expect(form.getByLabel("Purchase price paid ($)")).toHaveValue(
        "8750.25",
      );
      await form
        .getByRole("button", { name: "Confirm purchase record" })
        .click();
      await expect(form).toHaveCount(0);
      expect(submissions).toHaveLength(2);
      expect(submissions[1]).toEqual(submissions[0]);
      expect(submissions[0]).not.toHaveProperty("marketValue");
      await page.getByRole("link", { name: "Purchase recorded" }).click();
      const source = page
        .locator(`a[href="/deal/${deal.id}"]`)
        .filter({ hasText: "Review source listing" });
      await expect(source).toBeVisible();
      await expect(
        page.getByText("$8,750.25", { exact: true }).first(),
      ).toBeVisible();
      const unit = source.locator("..");
      // A retained URL can expire: the shared gallery and its honest fallback must remain usable.
      await expect(
        unit.getByRole("button", { name: /Open photo 1 of/ }).first(),
      ).toBeVisible();
      await expect(
        page.getByText("Recorded costs", { exact: true }).locator(".."),
      ).toContainText("$8,750.25");
      await expect(
        page.getByText("Reference spread", { exact: true }).locator(".."),
      ).toContainText("—");
      await expect(
        page.getByText("Reference spread", { exact: true }).locator(".."),
      ).toContainText("0 of 1 active units");
      const saved = await db
        .from("inventory")
        .select("id,deal_id,purchase_price,floor_date,photos")
        .eq("id", savedId!)
        .eq("dealer_id", ownerId);
      expect(saved.error).toBeNull();
      expect(saved.data).toHaveLength(1);
      expect(saved.data![0]).toMatchObject({
        deal_id: deal.id,
        purchase_price: 8750.25,
      });
      expect(saved.data![0].floor_date.slice(0, 10)).toBe("2026-01-15");
      expect(saved.data![0].photos.length).toBeGreaterThan(0);
      const outcomes = await db
        .from("deal_outcomes")
        .select("id,costs_complete,prediction_basis,predicted_sell")
        .eq("inventory_id", savedId!)
        .eq("user_id", ownerId);
      expect(outcomes.error).toBeNull();
      expect(outcomes.data).toEqual([
        {
          id: savedId,
          costs_complete: false,
          prediction_basis: "none",
          predicted_sell: null,
        },
      ]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 2,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      await page.screenshot({
        path: `.vercel/purchase-accuracy-${info.project.name}.png`,
        fullPage: true,
      });
    } finally {
      if (savedId) {
        const outcomes = await db
          .from("deal_outcomes")
          .delete()
          .eq("inventory_id", savedId)
          .eq("user_id", ownerId);
        const inventory = await db
          .from("inventory")
          .delete()
          .eq("id", savedId)
          .eq("dealer_id", ownerId);
        expect(outcomes.error).toBeNull();
        expect(inventory.error).toBeNull();
      }
    }
  });
});
