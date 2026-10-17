import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";

test.describe("Market Explorer home", () => {
  localOnly();
  test.use({ storageState: storagePath("personal") });

  test("opens the whole market for personal buyers with Market first and Discover second", async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page).toHaveURL(/\/market/);
    await expect(
      page.getByRole("heading", { name: "Market Explorer", exact: true }),
    ).toBeVisible();
    await expect(page.locator("article").first()).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Interactive results map" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Toggle results map" }).click();
    await expect(
      page.getByRole("region", { name: "Interactive results map" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Toggle results map" }).click();
    await expect(
      page.getByRole("region", { name: "Interactive results map" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Market intelligence" }),
    ).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const headerTargets = await page
      .locator("header")
      .first()
      .locator("a, button")
      .filter({ visible: true })
      .evaluateAll((targets) =>
        targets.map((target) => {
          const box = target.getBoundingClientRect();
          return {
            label: target.getAttribute("aria-label") || target.textContent,
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
          };
        }),
      );
    for (let i = 0; i < headerTargets.length; i++) {
      const target = headerTargets[i];
      expect(
        target.left,
        `${target.label} stays inside the viewport`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        target.right,
        `${target.label} stays inside the viewport`,
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
      for (const next of headerTargets.slice(i + 1)) {
        const overlapWidth =
          Math.min(target.right, next.right) - Math.max(target.left, next.left);
        const overlapHeight =
          Math.min(target.bottom, next.bottom) - Math.max(target.top, next.top);
        expect(
          overlapWidth > 1 && overlapHeight > 1,
          `${target.label} must not overlap ${next.label}`,
        ).toBe(false);
      }
    }
    const preview = page.getByTestId("market-price-preview").first();
    await expect(preview).toBeVisible();
    await expect(preview.getByTestId("market-identity-preview")).toHaveText(
      /[A-Za-z]/,
    );
    const previewBox = await preview.boundingBox();
    const mobileNavigation = page
      .getByRole("navigation", { name: "Primary mobile navigation" })
      .filter({ visible: true });
    const mobileNav = (await mobileNavigation.count())
      ? await mobileNavigation.boundingBox()
      : null;
    const visibleBottom = mobileNav?.y ?? page.viewportSize()!.height;
    expect(previewBox!.y + previewBox!.height).toBeLessThanOrEqual(
      visibleBottom,
    );
    const initialPhoto = page.locator("article img").first();
    await expect
      .poll(() =>
        initialPhoto.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    const photoBox = await initialPhoto.boundingBox();
    expect(
      Math.min(photoBox!.y + photoBox!.height, visibleBottom) -
        Math.max(0, photoBox!.y),
    ).toBeGreaterThanOrEqual(120);
    const locationFields = await page
      .getByRole("region", { name: "Location and radius" })
      .locator("input, select")
      .evaluateAll((fields) =>
        fields.map((field) => ({
          fontSize: parseFloat(getComputedStyle(field).fontSize),
          height: field.getBoundingClientRect().height,
        })),
      );
    for (const field of locationFields) {
      expect(field.fontSize).toBeGreaterThanOrEqual(16);
      expect(field.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: testInfo.outputPath("market-initial-viewport.png"),
    });
    const insights = page.getByRole("button", {
      name: "Market insights",
      exact: true,
    });
    await insights.click();
    await expect(
      page.getByRole("region", { name: "Market intelligence" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Interactive market charts" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Listings/ }).click();
    await expect(
      page.getByRole("region", { name: "Market intelligence" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: /Filters/ }).click();
    await expect(
      page.getByRole("region", { name: "Smart market filters" }),
    ).toBeVisible();
    await page
      .getByRole("region", { name: "Smart market filters" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("market-filters.png") });
    await page
      .getByRole("button", { name: /Show .* listings/ })
      .first()
      .click();
    await expect(page.locator("article").first()).toBeVisible();
    const nav = page
      .getByRole("navigation", {
        name: /^Primary (mobile|desktop) navigation$/,
      })
      .filter({ visible: true });
    await expect(nav).toHaveCount(1);
    expect(
      (
        await nav
          .locator("a")
          .evaluateAll((links) =>
            links.map(
              (link) =>
                new URL(link.getAttribute("href")!, location.origin).pathname,
            ),
          )
      ).slice(0, 2),
    ).toEqual(["/market", "/discover"]);
    await expect(
      page.getByText("This tool is for reseller and dealer desks"),
    ).toHaveCount(0);
    const photo = page.locator("article img").first();
    await photo.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        photo.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("market-listings.png") });
    const card = page.locator("article").first();
    const enlarge = card.getByRole("button", { name: /^Enlarge photos of / });
    await enlarge.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const enlarged = page.getByRole("dialog").locator("img");
    await expect
      .poll(() =>
        enlarged.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    const enlargedBox = await enlarged.boundingBox();
    expect(enlargedBox!.x).toBeGreaterThanOrEqual(0);
    expect(enlargedBox!.y).toBeGreaterThanOrEqual(0);
    expect(enlargedBox!.x + enlargedBox!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    expect(enlargedBox!.y + enlargedBox!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
    const nextImage = page.getByRole("button", {
      name: "Next image",
      exact: true,
    });
    if (await nextImage.isVisible()) {
      await nextImage.click();
      await expect(
        page.getByRole("dialog").locator('[aria-live="polite"]'),
      ).toHaveText(/^2\s*\/\s*\d+$/);
      await expect
        .poll(() =>
          enlarged.evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBeGreaterThan(0);
      await page
        .getByRole("button", { name: "Previous image", exact: true })
        .click();
      await expect(
        page.getByRole("dialog").locator('[aria-live="polite"]'),
      ).toHaveText(/^1\s*\/\s*\d+$/);
    }
    await page
      .getByRole("button", { name: "Close photo preview", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(enlarge).toBeFocused();
    const savedResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/saved-cars" &&
        response.request().method() === "POST",
    );
    await card.getByRole("button", { name: /^Save to account:/ }).click();
    const confirmed = await savedResponse;
    expect(confirmed.ok()).toBe(true);
    const receipt = await confirmed.json();
    expect(receipt.success).toBe(true);
    expect(typeof receipt.id).toBe("string");
    await expect(
      card.getByRole("button", { name: /^Remove from account:/ }),
    ).toBeEnabled();
    await page.reload();
    const remove = card.getByRole("button", { name: /^Remove from account:/ });
    await expect(remove).toBeVisible();
    const removedResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/saved-cars/${receipt.id}` &&
        response.request().method() === "DELETE",
    );
    await remove.click();
    const removed = await removedResponse;
    expect(removed.ok()).toBe(true);
    expect((await removed.json()).success).toBe(true);
    await expect(
      card.getByRole("button", { name: /^Save to account:/ }),
    ).toBeVisible();
    await preview.scrollIntoViewIfNeeded();
    const point = await preview.boundingBox();
    const destination = await card.locator("h3 a").getAttribute("href");
    const origin = page.url();
    if (testInfo.project.use.hasTouch)
      await page.touchscreen.tap(
        point!.x + point!.width / 2,
        point!.y + point!.height / 2,
      );
    else
      await page.mouse.click(
        point!.x + point!.width / 2,
        point!.y + point!.height / 2,
      );
    await expect(page).toHaveURL(new URL(destination!, origin).href);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(
      page.getByText("Before you decide", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^(Save vehicle|Saved)$/ }).first(),
    ).toBeEnabled();
    await page.goBack();
    await expect(page).toHaveURL(origin);
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("button", { name: /^Save to account:/ }),
    ).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test("Back restores a vehicle farther down the results without losing filters", async ({
    page,
  }) => {
    await page.goto("/market?mode=all&sort=askPrice&sortDir=asc");
    const card = page.locator("article").nth(8);
    const link = card.locator('a[aria-label^="Open details for"]');
    await expect(link).toBeVisible();
    await link.scrollIntoViewIfNeeded();
    const before = await card.boundingBox();
    const origin = page.url();
    const destination = await link.getAttribute("href");
    await link.click();
    await expect(page).toHaveURL(new URL(destination!, origin).href);
    await expect(
      page.getByText("Before you decide", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^(Save vehicle|Saved)$/ }).first(),
    ).toBeEnabled();
    await page.goBack();
    await expect(page).toHaveURL(origin);
    await expect(link).toHaveAttribute("href", destination!);
    await expect
      .poll(async () => Math.abs((await card.boundingBox())!.y - before!.y))
      .toBeLessThan(16);
    await expect(page.getByLabel("Sort market results")).toHaveValue(
      "askPrice:asc",
    );
  });

  test("runs a ZIP radius search, sorts by distance and restores its shareable URL", async ({
    page,
  }) => {
    await page.goto("/market");
    await page.getByLabel("Search location", { exact: true }).fill("63101");
    await page.getByLabel("Search radius", { exact: true }).selectOption("100");
    const result = page.waitForResponse(
      (response) =>
        response.url().includes("/api/market/explore?") &&
        new URL(response.url()).searchParams.get("near") === "63101",
    );
    await page.getByRole("button", { name: "Search this area" }).click();
    const response = await result;
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.total).toBeGreaterThan(0);
    expect(
      body.rows.every(
        (row: { distanceMiles: number }) =>
          row.distanceMiles >= 0 && row.distanceMiles <= 100,
      ),
    ).toBe(true);
    await page
      .getByLabel("Sort market results")
      .selectOption("distanceMiles:asc");
    await expect(page).toHaveURL(/sort=distanceMiles/);
    await page.reload();
    await expect(
      page.getByLabel("Search location", { exact: true }),
    ).toHaveValue("63101");
    await expect(page.getByLabel("Sort market results")).toHaveValue(
      "distanceMiles:asc",
    );
    await page
      .getByLabel("Search area", { exact: true })
      .selectOption("nationwide");
    await expect(page).not.toHaveURL(/near=/);
  });

  test("saved-area shortcuts retain home settings and keep the first price visible", async ({
    page,
  }) => {
    const original = (await (await page.request.get("/api/preferences")).json())
      .prefs;
    try {
      const saved = await page.request.put("/api/preferences", {
        data: {
          homeLocation: {
            state: "MO",
            city: "St. Louis",
            zip: "63101",
            radiusMi: 50,
          },
        },
      });
      expect(saved.ok()).toBe(true);
      const homeResults = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/market/explore" &&
          new URL(response.url()).searchParams.get("near") === "63101",
      );
      await page.goto("/market");
      expect((await homeResults).ok()).toBe(true);
      await expect(
        page.getByLabel("Search location", { exact: true }),
      ).toHaveValue("63101");
      await expect(
        page.getByLabel("Search radius", { exact: true }),
      ).toHaveValue("50");
      const price = page.getByTestId("market-price-preview").first();
      await expect(price).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const box = await price.boundingBox();
      const mobileNavigation = page
        .getByRole("navigation", { name: "Primary mobile navigation" })
        .filter({ visible: true });
      const nav = (await mobileNavigation.count())
        ? await mobileNavigation.boundingBox()
        : null;
      expect(box!.y + box!.height).toBeLessThanOrEqual(
        nav?.y ?? page.viewportSize()!.height,
      );
      await expect(
        page.getByRole("button", { name: "Use my location", exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Search area", { exact: true })
        .selectOption("nationwide");
      await expect(page).not.toHaveURL(/near=/);
      await page
        .getByLabel("Search area", { exact: true })
        .selectOption("home");
      await expect(page).toHaveURL(/near=63101/);
      await expect(
        page.getByLabel("Search radius", { exact: true }),
      ).toHaveValue("50");
      const current = (
        await (await page.request.get("/api/preferences")).json()
      ).prefs;
      expect(current.homeLocation.zip).toBe("63101");
    } finally {
      const restored = await page.request.put("/api/preferences", {
        data: { homeLocation: original.homeLocation ?? null },
      });
      expect(restored.ok()).toBe(true);
    }
  });

  test("keeps table view reachable and separates bids from cash asks", async ({
    page,
  }) => {
    await page.goto("/market?priceKind=current_bid&mode=all");
    await expect(page.locator("article").first()).toBeVisible();
    const bidLabels = page
      .locator("article")
      .first()
      .getByText("Current bid", { exact: true });
    await expect(bidLabels).toHaveCount(2);
    await expect(bidLabels.first()).toBeVisible();
    await expect(bidLabels.last()).toBeVisible();
    await page.getByRole("button", { name: "Table view", exact: true }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(
      page.getByRole("table").getByText("Current bid", { exact: true }).first(),
    ).toBeVisible();
  });
});
