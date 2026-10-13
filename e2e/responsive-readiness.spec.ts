import { expect, test } from "@playwright/test";
import { storagePath, type Desk } from "./support/accounts";
import { localOnly } from "./support/target";
import { expectHealthy, watchHealth } from "./support/health";

for (const desk of [
  "personal",
  "diy",
  "reseller",
  "dealer",
  "parts",
] as Desk[]) {
  test.describe(`${desk} responsive readiness`, () => {
    localOnly();
    test.use({ storageState: storagePath(desk), serviceWorkers: "block" });

    test("core pages fit and retain account navigation", async ({
      page,
    }, info) => {
      test.setTimeout(120_000);
      const health = watchHealth(page);
      await page.addInitScript(() => {
        localStorage.setItem(
          "theme",
          sessionStorage.getItem("responsive-qa-theme") || "light",
        );
      });
      for (const theme of ["light", "dark"]) {
        if (theme === "dark")
          await page.evaluate(
            (value) => sessionStorage.setItem("responsive-qa-theme", value),
            theme,
          );
        for (const route of ["discover", "scan", "saved", "settings"]) {
          await page.goto(`/${route}`);
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            theme,
          );
          await expect(page.locator("h1").first()).toBeAttached();
          if (route === "settings")
            await expect(
              page.getByLabel("Phone", { exact: true }),
            ).toBeVisible();
          if (route === "scan") {
            await expect(
              page.getByRole("button", {
                name: "Search saved inventory",
                exact: true,
              }),
            ).toBeEnabled();
            await expect(
              page.locator('main a[href^="/deal/"]').first(),
            ).toBeVisible();
          }
          if (route === "saved")
            await expect(
              page
                .getByText("Nothing saved yet", { exact: true })
                .or(page.locator('main a[href^="/deal/"]'))
                .first(),
            ).toBeVisible();
          if (route === "discover") {
            const firstRail = page
              .getByRole("region", { name: /vehicles$/ })
              .first();
            await expect(firstRail).toBeVisible({ timeout: 30_000 });
            await expect
              .poll(() =>
                firstRail.evaluate(
                  (el) => getComputedStyle(el.closest("section")!).opacity,
                ),
              )
              .toBe("1");
          }
          await expect(
            page.getByRole("button", { name: "Account menu", exact: true }),
          ).toBeVisible();
          await expectHealthy(page, health);
          await page.screenshot({
            path: info.outputPath(`${desk}-${theme}-${route}.png`),
          });
          if (route === "discover") {
            const account = page.getByRole("button", {
              name: "Account menu",
              exact: true,
            });
            await account.click();
            await page
              .getByRole("button", { name: "Decision guide", exact: true })
              .click();
            const guide = page.getByRole("dialog", { name: "Decision guide" });
            await expect(guide).toBeVisible();
            await expect(
              guide.getByRole("textbox", {
                name: "Message for decision guide",
              }),
            ).toBeVisible();
            await page.keyboard.press("Tab");
            expect(
              await guide.evaluate((el) => el.contains(document.activeElement)),
            ).toBe(true);
            const closeBox = await guide
              .getByRole("button", { name: "Close decision guide" })
              .boundingBox();
            expect(
              Math.round((closeBox?.width ?? 0) * 100) / 100,
            ).toBeGreaterThanOrEqual(44);
            expect(
              Math.round((closeBox?.height ?? 0) * 100) / 100,
            ).toBeGreaterThanOrEqual(44);
            await guide
              .getByRole("button", {
                name: "What should I check before buying?",
                exact: true,
              })
              .click();
            await expect(
              guide.getByText(/^Before buying, confirm the title source/),
            ).toBeVisible();
            await page.screenshot({
              path: info.outputPath(`${desk}-${theme}-guide.png`),
            });
            await page.keyboard.press("Escape");
            await expect(guide).toHaveCount(0);
            await expect(account).toBeFocused();
            await expectHealthy(page, health);
          }
        }
      }
    });

    test("discovery scrolling is controllable, measured and reduced-motion safe", async ({
      page,
    }, info) => {
      const health = watchHealth(page);
      await page.goto("/discover");
      if (info.project.name.startsWith("mobile")) {
        const session = await page.context().newCDPSession(page);
        await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      }
      const controls = page.getByRole("button", { name: /^Next vehicles in/ });
      await expect(controls.first()).toBeVisible({ timeout: 30_000 });
      const enabled = controls.and(page.locator(":enabled"));
      // Sizing and personalized data can settle after the first rail appears.
      await enabled
        .first()
        .waitFor({ state: "visible", timeout: 5000 })
        .catch(() => undefined);
      if ((await enabled.count()) === 0) {
        expect(await controls.count()).toBeGreaterThan(0);
        for (const control of await controls.all()) {
          await expect(control).toBeDisabled();
          const id = await control.getAttribute("aria-controls");
          const overflow = await page
            .locator(`[id="${id}"]`)
            .evaluate((el) => el.scrollWidth - el.clientWidth);
          expect(overflow).toBeLessThanOrEqual(2);
        }
        info.annotations.push({
          type: "note",
          description:
            "All controlled rails fit this viewport; disabled controls verified, no scrolling/FPS sample claimed.",
        });
        await expectHealthy(page, health);
        return;
      }
      const next = enabled.first();
      await expect(next).toBeEnabled({ timeout: 30_000 });
      const box = await next.boundingBox();
      expect(Math.round((box?.width ?? 0) * 100) / 100).toBeGreaterThanOrEqual(
        44,
      );
      expect(Math.round((box?.height ?? 0) * 100) / 100).toBeGreaterThanOrEqual(
        44,
      );
      const controlsId = await next.getAttribute("aria-controls");
      const strip = page.locator(`[id="${controlsId}"]`);
      await page.emulateMedia({ reducedMotion: "reduce" });
      if (info.project.use.hasTouch) await next.tap();
      else await next.click();
      await expect
        .poll(() => strip.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
      await strip.focus();
      await page.keyboard.press("ArrowLeft");
      await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(0);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const frames = await strip.evaluate(async (element) => {
        const times: number[] = [];
        let previous = performance.now();
        const end = previous + 1500;
        let minLeft = element.scrollLeft;
        let maxLeft = minLeft;
        element.scrollTo({
          left: Math.min(1000, element.scrollWidth - element.clientWidth),
          behavior: "smooth",
        });
        await new Promise<void>((resolve) => {
          const frame = (now: number) => {
            times.push(now - previous);
            previous = now;
            minLeft = Math.min(minLeft, element.scrollLeft);
            maxLeft = Math.max(maxLeft, element.scrollLeft);
            if (now < end) requestAnimationFrame(frame);
            else resolve();
          };
          requestAnimationFrame(frame);
        });
        const sorted = times.slice(1).sort((a, b) => a - b);
        return {
          samples: sorted.length,
          medianMs: sorted[Math.floor(sorted.length * 0.5)],
          p95Ms: sorted[Math.floor(sorted.length * 0.95)],
          gapsOver50Ms: sorted.filter((ms) => ms > 50).length,
          movementPx: maxLeft - minLeft,
          note: "Synthetic rAF intervals, not physical-device presented FPS or field INP.",
        };
      });
      expect(frames.samples).toBeGreaterThan(10);
      expect(frames.movementPx).toBeGreaterThan(50);
      await info.attach("scroll-frame-sample", {
        body: JSON.stringify(frames, null, 2),
        contentType: "application/json",
      });
      await expectHealthy(page, health);
    });
  });
}
