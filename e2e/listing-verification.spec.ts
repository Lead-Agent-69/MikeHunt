import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";

for (const desk of ["personal", "dealer"] as const) {
  test.describe(`${desk} actionable verification`, () => {
    localOnly();
    test.use({ storageState: storagePath(desk) });

    test("opens the right tools, preserves keyboard focus, and fits the viewport", async ({
      page,
    }, testInfo) => {
      const response = await page.request
        .get("/api/deals?limit=1")
        .catch(() => {
          throw new Error(
            "Local listing request failed; request details redacted.",
          );
        });
      expect(response.ok()).toBe(true);
      const { deals } = await response.json();
      expect(deals?.[0]?.id).toBeTruthy();
      await page.goto(`/deal/${deals[0].id}`);
      const checklist = page.getByRole("region", {
        name: "Before you decide",
        exact: true,
      });
      await expect(checklist).toBeVisible();
      await checklist.screenshot({
        path: testInfo.outputPath("verification-checklist.png"),
      });
      await expect(
        page.getByRole("region", { name: "Vehicle evidence status" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("region", { name: "Listing to check" }),
      ).toHaveCount(0);
      const targets = [
        ["Check title and condition", "Check condition, title, and history"],
        ["Compare market evidence", "Compare price and timing"],
        [
          desk === "dealer"
            ? "Plan costs and contact"
            : "Contact seller and keep notes",
          "Costs, seller, and private notes",
        ],
      ];
      for (const [button, heading] of targets) {
        const summary = page.locator("summary").filter({
          has: page.getByRole("heading", { name: heading, exact: true }),
        });
        await expect(summary.locator("..")).not.toHaveAttribute("open");
        await checklist
          .getByRole("button", { name: button, exact: true })
          .click();
        await expect(summary.locator("..")).toHaveAttribute("open", "");
        await expect(summary).toBeFocused();
        await summary.press("Enter");
        await expect(summary.locator("..")).not.toHaveAttribute("open");
        await checklist
          .getByRole("button", { name: button, exact: true })
          .click();
        await expect(summary).toBeFocused();
        await summary.press("Enter");
      }
      // Genuine browser geometry catches overflow and undersized touch controls.
      const geometry = await checklist.evaluate((element) => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        actions: [
          ...element.querySelectorAll<HTMLButtonElement>(
            "button:not([disabled])",
          ),
        ].map((button) => ({
          width: button.getBoundingClientRect().width,
          height: button.getBoundingClientRect().height,
        })),
      }));
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
      expect(geometry.actions).toHaveLength(3);
      for (const action of geometry.actions) {
        expect(action.width).toBeGreaterThanOrEqual(44);
        expect(action.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.getByTestId("flip-scenario")).toHaveCount(0);
    });
  });
}
