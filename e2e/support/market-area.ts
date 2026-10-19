import { expect, type Page } from "@playwright/test";
import { AREA_RADIUS_STEPS } from "../../lib/search/area-scope";
export async function openMarketArea(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Search area", exact: true });
  if (!(await dialog.isVisible()))
    await page.locator("#market-search-area-trigger").click();
  await expect(dialog).toBeVisible();
  return dialog;
}
export async function setMarketRadius(page: Page, miles: number) {
  const index = AREA_RADIUS_STEPS.indexOf(miles);
  if (index < 0) throw new Error("Use a supported radius step in this helper.");
  const slider = page.getByRole("slider", {
    name: "Search radius",
    exact: true,
  });
  await slider.focus();
  await slider.press("Home");
  for (let n = 0; n < index; n++) await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", `${miles} miles`);
}
