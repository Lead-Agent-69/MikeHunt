import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";
const amounts = {
  purchase_price: "10000",
  purchased_at: "2026-09-01",
  sell_price: "16000",
  sold_at: "2026-10-01",
  actual_buyer_fees: "1000",
  actual_tax_title: "500",
  actual_recon: "1000",
  actual_transport: "300",
  actual_holding: "200",
  actual_selling: "420",
  actual_other: "400",
};
test.describe("actual outcome ledger", () => {
  localOnly();
  test.use({ storageState: storagePath("reseller"), serviceWorkers: "block" });
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: actual costs, retry, loss and editing work at viewport size`, async ({
      page,
    }, info) => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      expect(["127.0.0.1", "localhost", "[::1]"]).toContain(
        new URL(url).hostname,
      );
      const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const attempts: Array<Record<string, unknown>> = [];
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(
        (value) => localStorage.setItem("theme", value),
        theme,
      );
      await page.route("**/api/outcomes", async (route) => {
        if (route.request().method() === "POST") {
          attempts.push(route.request().postDataJSON());
          if (attempts.length === 1) {
            // The write succeeds but its acknowledgement is lost: retry must recover one row.
            const persisted = await route.fetch();
            expect(persisted.ok()).toBe(true);
            return route.fulfill({
              status: 500,
              json: { error: "Temporary save failure. Retry this record." },
            });
          }
        }
        return route.continue();
      });
      let recordId: string | undefined;
      try {
        await page.goto("/insights");
        await expect(
          page.getByRole("heading", { name: "Outcomes and learning" }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Record a purchase or sale" })
          .click();
        const editor = page.getByTestId("outcome-editor");
        await expect(
          editor.locator('[data-outcome-field="purchase_price"]'),
        ).toHaveValue("");
        await expect(
          editor.locator('[data-outcome-field="actual_recon"]'),
        ).toHaveValue("");
        await editor.locator('[data-outcome-field="make"]').fill("Outcome QA");
        const name = `${info.project.name}-${theme}-${Date.now()}`;
        await editor.locator('[data-outcome-field="model"]').fill(name);
        for (const [field, value] of Object.entries(amounts))
          await editor.locator(`[data-outcome-field="${field}"]`).fill(value);
        await expect(editor.getByTestId("outcome-summary")).not.toContainText(
          "$2,180",
        );
        await editor.getByRole("checkbox").check();
        await expect(editor.getByTestId("outcome-summary")).toContainText(
          "$2,180",
        );
        await expect(editor.getByTestId("outcome-summary")).toContainText(
          "$13,820",
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 2,
          ),
        ).toBe(true);
        expect(
          await editor
            .locator("input")
            .first()
            .evaluate((element) => element.getBoundingClientRect().height),
        ).toBeGreaterThanOrEqual(44);
        await editor.screenshot({
          path: `.vercel/outcomes-editor-${info.project.name}-${theme}.png`,
          animations: "disabled",
        });
        await editor
          .getByRole("button", { name: "Save actual outcome" })
          .click();
        await expect(editor.getByRole("alert")).toContainText(
          "Temporary save failure",
        );
        await expect(
          editor.locator('[data-outcome-field="sell_price"]'),
        ).toHaveValue("16000");
        await editor
          .getByRole("button", { name: "Save actual outcome" })
          .click();
        await expect(editor).toHaveCount(0);
        expect(attempts).toHaveLength(2);
        expect(attempts[0].id).toBe(attempts[1].id);
        recordId = attempts[1].id as string;
        const article = page.getByRole("article").filter({ hasText: name });
        await expect(article).toContainText("Net $2,180");
        await article
          .getByRole("button", { name: "Edit actual record" })
          .click();
        await editor
          .locator('[data-outcome-field="sell_price"]')
          .fill("12000.25");
        await expect(editor.getByRole("checkbox")).not.toBeChecked();
        await editor.getByRole("checkbox").check();
        await expect(editor.getByTestId("outcome-summary")).toContainText(
          "-$1,819.75",
        );
        await editor
          .getByRole("button", { name: "Save actual outcome" })
          .click();
        await expect(editor).toHaveCount(0);
        await expect(article).toContainText("Net -$1,819.75");
        const response = await page.request.get("/api/outcomes");
        const rows = (await response.json()).outcomes.filter(
          (row: { id: string }) => row.id === recordId,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          actual_profit: -1819.75,
          actual_all_in_cost: 13820,
          revision: 2,
          costs_complete: true,
          evidence_basis: "owner_reported",
        });
        expect(errors).toEqual([]);
      } finally {
        recordId ??= attempts[0]?.id as string | undefined;
        if (recordId) {
          const removed = await db
            .from("deal_outcomes")
            .delete()
            .eq("id", recordId);
          expect(removed.error).toBeNull();
        }
      }
    });
  }
});
