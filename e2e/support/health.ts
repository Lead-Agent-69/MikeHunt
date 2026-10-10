import { expect, type Page } from "@playwright/test";

/** Noise that is expected in a local stack (no realtime server, third-party listing photos). */
const IGNORED_CONSOLE = [
  /realtime\/v1\/websocket/i,
  /Failed to load resource/i,
  /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_BLOCKED_BY/i,
  /Download the React DevTools/i,
];

export type Health = { pageErrors: string[]; consoleErrors: string[] };

/** Start collecting uncaught page errors and unexpected console errors. */
export function watchHealth(page: Page): Health {
  const h: Health = { pageErrors: [], consoleErrors: [] };
  page.on("pageerror", (e) => h.pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (!IGNORED_CONSOLE.some((re) => re.test(t))) h.consoleErrors.push(t.slice(0, 300));
  });
  return h;
}

/** Common post-conditions for any rendered page. */
export async function expectHealthy(page: Page, h: Health) {
  await expect(page.locator("text=Something went wrong")).toHaveCount(0);
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  expect(h.pageErrors, `uncaught page errors on ${page.url()}`).toEqual([]);
  // Mobile layout: nothing should force sideways scrolling at 390px.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect.soft(overflow, `horizontal overflow (px) on ${page.url()}`).toBeLessThanOrEqual(1);
}

/** Wait for a client page to settle without relying on networkidle (polling pages never idle). */
export async function settle(page: Page, ms = 1500) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(ms);
}
