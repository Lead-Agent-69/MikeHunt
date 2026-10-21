import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";
import { completeSale } from "../lib/outcomes/ledger.fixture";

test.describe("reported sale review", () => {
  localOnly();
  test.use({ storageState: storagePath("reseller"), serviceWorkers: "block" });
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: find missing costs and complete the same sale`, async ({
      page,
    }, info) => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      expect(["127.0.0.1", "localhost", "[::1]"]).toContain(
        new URL(url).hostname,
      );
      const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false },
      });
      const id = randomUUID();
      const model = `review-${info.project.name}-${theme}-${id.slice(0, 8)}`;
      const created = await page.request.post("/api/outcomes", {
        data: {
          ...completeSale({ actual_recon: null, costs_complete: false }),
          id,
          make: "Outcome QA",
          model,
        },
      });
      expect(created.ok()).toBe(true);
      try {
        await page.addInitScript(
          (value) => localStorage.setItem("theme", value),
          theme,
        );
        await page.goto("/insights");
        const filter = page.getByRole("button", {
          name: /Sales needing review/,
        });
        await filter.click();
        await expect(filter).toHaveAttribute("aria-pressed", "true");
        const article = page.getByRole("article").filter({ hasText: model });
        await expect(article).toContainText(
          "Still needed: Repair and preparation",
        );
        await expect(article).not.toContainText("Net $");
        await article
          .getByRole("button", { name: "Edit actual record" })
          .click();
        const editor = page.getByTestId("outcome-editor");
        await editor.screenshot({
          path: `.vercel/outcome-review-needs-${info.project.name}-${theme}.png`,
          animations: "disabled",
        });
        await editor
          .getByRole("button", { name: "Repair and preparation", exact: true })
          .click();
        await expect(
          editor.locator('[data-outcome-field="actual_recon"]'),
        ).toBeFocused();
        await editor
          .locator('[data-outcome-field="actual_recon"]')
          .fill("1000");
        await editor
          .getByRole("button", {
            name: "Review dates and actual expenses",
            exact: true,
          })
          .click();
        await expect(editor.getByRole("checkbox")).toBeFocused();
        await editor.getByRole("checkbox").check();
        await expect(
          editor.getByRole("region", { name: "Remaining outcome details" }),
        ).toHaveCount(0);
        await expect(editor.getByTestId("outcome-summary")).toContainText(
          "$2,180",
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 2,
          ),
        ).toBe(true);
        await editor.screenshot({
          path: `.vercel/outcome-review-${info.project.name}-${theme}.png`,
          animations: "disabled",
        });
        await editor
          .getByRole("button", { name: "Save actual outcome" })
          .click();
        await expect(editor).toHaveCount(0);
        await expect(article).toHaveCount(0);
        await filter.click();
        await expect(article).toContainText("Net $2,180");
        const response = await page.request.get("/api/outcomes");
        const records = (await response.json()).outcomes.filter(
          (row: { id: string }) => row.id === id,
        );
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
          costs_complete: true,
          actual_profit: 2180,
          revision: 2,
        });
      } finally {
        const removed = await db.from("deal_outcomes").delete().eq("id", id);
        expect(removed.error).toBeNull();
      }
    });
  }
});
