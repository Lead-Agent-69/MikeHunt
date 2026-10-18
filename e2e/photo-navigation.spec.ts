import { expect, test, type Page } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";

const images = ["front", "rear", "interior"].map(
  (name) => `https://photos.test/photo-${name}.svg`,
);
async function fixture(page: Page, failRearOnce = false) {
  let rearAttempts = 0;
  await page.route("https://photos.test/**", async (route) => {
    if (
      failRearOnce &&
      route.request().url().includes("rear") &&
      rearAttempts++ === 0
    ) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#245074"/><text x="30" y="240" fill="white">Photo navigation QA fixture</text></svg>',
    });
  });
  await page.route("**/api/market/explore**", (route) =>
    route.fulfill({
      json: {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000000123",
            title: "Photo navigation QA vehicle",
            source: "independent_dealer",
            sourceUrl: "https://example.com/qa-listing",
            images,
            imageUrl: images[0],
            year: 2020,
            make: "Ford",
            model: "Mustang",
            askPrice: 15000,
            price: { kind: "asking", label: "Asking price", amount: 15000 },
            lane: "private",
            mileage: 30000,
            lastSeenAt: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 0,
        pageSize: 50,
        mode: "all",
        capped: false,
        deskAccess: "personal",
        facets: {
          states: {},
          lanes: { private: 1 },
          topMakes: [],
          laneColors: {},
          sources: [{ value: "independent_dealer", n: 1 }],
        },
      },
    }),
  );
  await page.goto("/market?mode=all");
  await expect(
    page.getByRole("button", {
      name: "Enlarge photos of Photo navigation QA vehicle",
    }),
  ).toBeVisible();
}

test.describe("photo navigation", () => {
  localOnly();
  test.use({ storageState: storagePath("personal") });

  test("photo halves and arrows cycle once, preserve focus, and fit the viewport", async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await fixture(page);
    const trigger = page.getByRole("button", {
      name: "Enlarge photos of Photo navigation QA vehicle",
    });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    const area = dialog.locator("[data-photo-navigation]");
    await expect(dialog.getByText("1 / 3", { exact: true })).toBeVisible();
    const bounds = await area.boundingBox();
    expect(bounds!.width).toBeGreaterThan(0);
    const tap = async (half: number) => {
      const options = {
        position: { x: bounds!.width * half, y: bounds!.height / 2 },
      };
      if (testInfo.project.use.hasTouch) await area.tap(options);
      else await area.click(options);
    };
    await tap(0.75);
    await expect(dialog.getByText("2 / 3", { exact: true })).toBeVisible();
    await tap(0.25);
    await expect(dialog.getByText("1 / 3", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Previous image" }).click();
    await expect(dialog.getByText("3 / 3", { exact: true })).toBeVisible();
    await tap(0.75);
    await expect(dialog.getByText("1 / 3", { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        dialog
          .locator("img")
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    const imageBounds = await dialog.locator("img").boundingBox();
    expect(imageBounds!.x).toBeGreaterThanOrEqual(0);
    expect(imageBounds!.x + imageBounds!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    expect(imageBounds!.y + imageBounds!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
    await page.screenshot({
      path: testInfo.outputPath("photo-navigation.png"),
    });
    await dialog.getByRole("button", { name: "Close photo preview" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(/\/market/);
    const photoLink = page.getByRole("link", {
      name: "Open details for Photo navigation QA vehicle",
    });
    const cardBounds = await photoLink.boundingBox();
    const right = {
      position: { x: cardBounds!.width * 0.75, y: cardBounds!.height / 2 },
    };
    if (testInfo.project.use.hasTouch) await photoLink.tap(right);
    else await photoLink.click(right);
    await expect(photoLink.locator("img")).toHaveAttribute("src", images[1]);
    await expect(page).toHaveURL(/\/market/);
    await page
      .getByRole("button", {
        name: "Previous photo of Photo navigation QA vehicle",
      })
      .click();
    await expect(photoLink.locator("img")).toHaveAttribute("src", images[0]);
    expect(errors).toEqual([]);
  });

  test("failed photos can be retried without advancing the gallery", async ({
    page,
  }) => {
    await fixture(page, true);
    await page
      .getByRole("button", {
        name: "Enlarge photos of Photo navigation QA vehicle",
      })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Next image" }).click();
    await expect(
      dialog.getByText("This photo could not load.", { exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Retry photo" }).click();
    await expect(dialog.getByText("2 / 3", { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        dialog
          .locator("img")
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    await dialog.getByRole("button", { name: "Next image" }).click();
    await expect(dialog.getByText("3 / 3", { exact: true })).toBeVisible();
  });
});
