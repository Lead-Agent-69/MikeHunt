import { expect, test } from "@playwright/test";
import { storagePath, type Desk } from "./support/accounts";
import { localOnly } from "./support/target";
import { expectHealthy, watchHealth } from "./support/health";

test.describe("recorded user walkthrough acceptance", () => {
  localOnly();
  test.use({
    storageState: async ({}, provideState, info) => {
      const desks: Record<string, Desk> = {
        desktop: "reseller",
        "tablet-768": "dealer",
        "tablet-1024": "parts",
        "mobile-320": "personal",
        "mobile-390": "diy",
        "webkit-390": "reseller",
        "firefox-desktop": "dealer",
      };
      await provideState(storagePath(desks[info.project.name] || "reseller"));
    },
    serviceWorkers: "block",
  });

  test("views and search controls are visible without a hidden Inventory Views menu", async ({
    page,
  }, info) => {
    const health = watchHealth(page);
    await page.goto("/discover");
    const views = page.getByRole("navigation", { name: "Inventory views" });
    await expect(
      views.getByRole("link", { name: "Results", exact: true }),
    ).toBeVisible();
    await expect(
      views.getByRole("link", { name: "Map", exact: true }),
    ).toBeVisible();
    const quickFilters = page.getByRole("button", { name: /Quick filters/ });
    if (await quickFilters.isVisible()) await quickFilters.click();
    await expect(page.getByLabel("Make", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Price up to", { exact: true })).toBeVisible();
    await page.goto(
      "/scan?scope=explicit&state=all&zip=63101&radius=50&q=WalkthroughRadius",
    );
    await expect(
      page.getByRole("button", {
        name: "Search area: Within 50 mi of 63101",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Quick make", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Quick model", { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("Quick price up to ($)", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Quick mileage up to", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Quick source or dealer", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "All filters", exact: true }),
    ).toBeVisible();
    await expectHealthy(page, health);
    await page.screenshot({
      path: info.outputPath("visible-search.png"),
      fullPage: false,
    });
  });

  test("50-mile St. Louis search includes Illinois, excludes Chicago and ranks qualified price gaps", async ({
    page,
  }) => {
    const response = await page.request.get(
      "/api/scan?scope=explicit&state=all&zip=63101&radius=50&q=WalkthroughRadius&sort=margin",
    );
    expect(response.ok()).toBe(true);
    const result = await response.json();
    expect(result.vehicles.map((row: any) => row.locationState).sort()).toEqual(
      ["IL", "MO"],
    );
    expect(result.vehicles.map((row: any) => row.dealMargin)).toEqual([
      6000, 4000,
    ]);
    expect(
      result.vehicles.some((row: any) => row.locationCity === "Chicago"),
    ).toBe(false);
    const expectedIds = result.vehicles.map((row: any) => row.id).sort();
    const scope =
      "scope=explicit&state=all&zip=63101&radius=50&q=WalkthroughRadius";
    const feed = await page.request.get(`/api/feed?browse=all&${scope}`);
    expect(feed.ok()).toBe(true);
    expect((await feed.json()).items.map((row: any) => row.id).sort()).toEqual(
      expectedIds,
    );
    // Match Map's visible default: All inventory, not the legacy actionable-only API default.
    const map = await page.request.get(`/api/deals/map?${scope}&verdict=all`);
    expect(map.ok()).toBe(true);
    expect((await map.json()).points.map((row: any) => row.id).sort()).toEqual(
      expectedIds,
    );
    const facets = await page.request.get(`/api/scan/facets?${scope}`);
    expect(facets.ok()).toBe(true);
    expect((await facets.json()).states.sort()).toEqual(["IL", "MO"]);
    for (const [filters, states] of [
      ["source=independent_dealer,cars_com", ["IL", "MO"]],
      ["source=copart", []],
      ["maxMileage=44000", []],
      ["maxMileage=45000&make=Ford&model=Escape", ["IL", "MO"]],
      ["model=Fiesta", []],
      ["maxPrice=11000", ["IL"]],
    ] as const) {
      const filtered = await page.request.get(`/api/scan?${scope}&${filters}`);
      expect(filtered.ok()).toBe(true);
      expect(
        (await filtered.json()).vehicles
          .map((row: any) => row.locationState)
          .sort(),
      ).toEqual(states);
    }
    for (const [pageIndex, state] of [
      [0, "IL"],
      [1, "MO"],
    ] as const) {
      const response = await page.request.get(
        `/api/scan?${scope}&sort=margin&pageSize=1&page=${pageIndex}`,
      );
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.total).toBe(2);
      expect(body.vehicles.map((row: any) => row.locationState)).toEqual([
        state,
      ]);
      expect(body.hasMore).toBe(pageIndex === 0);
    }
    expect(
      (
        await page.request.get("/api/scan?source=cars_com,copart&sort=price")
      ).ok(),
    ).toBe(true);
  });

  test("preferences save and reload without a buyer role selector", async ({
    page,
  }, info) => {
    const health = watchHealth(page);
    const original =
      (await (await page.request.get("/api/preferences")).json()).prefs
        ?.buyerScope || {};
    try {
      await page.goto("/settings");
      await expect(
        page.getByRole("button", {
          name: "Save buying preferences",
          exact: true,
        }),
      ).toBeEnabled();
      await expect(page.getByLabel("Buyer mode", { exact: true })).toHaveCount(
        0,
      );
      await page.getByLabel("Budget up to ($)", { exact: true }).fill("20000");
      await page
        .getByRole("button", { name: "Save buying preferences", exact: true })
        .click();
      await expect(
        page.getByText("Buying preferences saved to your account.", {
          exact: true,
        }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByLabel("Budget up to ($)", { exact: true }),
      ).toHaveValue("20000");
      const prefs = await (await page.request.get("/api/preferences")).json();
      expect(prefs.prefs.buyerScope.buyerMode).toBe("reseller");
      expect(prefs.prefs).not.toHaveProperty("role");
      await expectHealthy(page, health);
      await page.screenshot({
        path: info.outputPath("buying-preferences.png"),
        fullPage: false,
      });
    } finally {
      const restored = await page.request.put("/api/preferences", {
        data: {
          buyerScope: {
            ...original,
            maxPrice: original.maxPrice ?? null,
            legacyBuyerMode: original.legacyBuyerMode ?? null,
          },
        },
      });
      expect(restored.ok()).toBe(true);
    }
  });

  test("profile save keeps a failed draft and confirms only after an explicit retry", async ({
    page,
  }) => {
    const health = watchHealth(page);
    await page.goto("/settings");
    const phone = page.getByLabel("Phone", { exact: true });
    const save = page.getByRole("button", {
      name: /^Save profile( and costs)?$/,
    });
    await expect(save).toBeEnabled();
    const original = await phone.inputValue();
    let failed = false;
    let profileWrites = 0;
    page.on("request", (req) => {
      if (
        new URL(req.url()).pathname === "/api/profile" &&
        req.method() === "POST"
      )
        profileWrites++;
    });
    await page.route("**/api/preferences", async (route) => {
      if (route.request().method() === "PUT" && !failed) {
        failed = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Local QA temporary upstream failure",
          }),
        });
      } else await route.continue();
    });
    try {
      await phone.fill("202-555-0198");
      await save.click();
      await expect(
        page.getByText("Preferences could not be saved", { exact: true }),
      ).toBeVisible();
      await expect(phone).toHaveValue("202-555-0198");
      await expect(page.getByText("Saved!", { exact: true })).toHaveCount(0);
      expect(profileWrites).toBe(0);
      await save.click();
      await expect(page.getByText("Saved!", { exact: true })).toBeVisible();
      expect(profileWrites).toBe(1);
      await page.reload();
      await expect(phone).toHaveValue("202-555-0198");
      await expectHealthy(page, health);
    } finally {
      const restored = await page.request.put("/api/preferences", {
        data: { profileContact: { phone: original } },
        timeout: 10000,
      });
      expect(restored.ok()).toBe(true);
    }
  });

  test("listing feedback gets a database-confirmed receipt and survives reload", async ({
    page,
  }, info) => {
    const response = await page.request.get(
      "/api/scan?scope=explicit&state=all&q=WalkthroughRadius&sort=price",
    );
    expect(response.ok()).toBe(true);
    const listing = (await response.json()).vehicles[0];
    expect(listing?.id).toBeTruthy();
    const health = watchHealth(page);
    await page.goto(`/deal/${listing.id}`);
    await page
      .getByRole("button", { name: "Report a listing issue", exact: true })
      .click();
    await page
      .getByLabel("What needs correcting?", { exact: true })
      .fill("Local QA synthetic report: verify seller price meaning.");
    const saved = page.waitForResponse(
      (result) =>
        result.url().endsWith("/api/feedback") &&
        result.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Send report", exact: true })
      .click();
    const receipt = await saved;
    expect(receipt.status()).toBe(201);
    const data = await receipt.json();
    await expect(
      page.getByText(`Report saved. Reference: ${data.id}`, { exact: true }),
    ).toBeVisible();
    await expectHealthy(page, health);
    await page.screenshot({
      path: info.outputPath("confirmed-feedback.png"),
      fullPage: false,
    });
    // A same-ID retry after page reload must confirm the same owned row, not create a second report.
    await page.reload();
    const retry = await page.request.post("/api/feedback", {
      data: {
        id: data.id,
        listing_id: listing.id,
        category: "price",
        comment: "Local QA synthetic report: verify seller price meaning.",
      },
    });
    expect(retry.status()).toBe(200);
    expect((await retry.json()).id).toBe(data.id);
  });
});
