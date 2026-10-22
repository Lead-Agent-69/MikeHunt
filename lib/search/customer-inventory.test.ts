import { describe, expect, it, vi } from "vitest";
import {
  applyCustomerInventory,
  isCustomerInventory,
  listingPhotos,
} from "./customer-inventory";

describe("customer inventory eligibility", () => {
  it.each([1, 3, 7, 30])(
    "honors an explicit %i-day research window without accepting future rows",
    (days) => {
      const query: any = {};
      for (const method of ["not", "neq", "gte", "lte", "or"])
        query[method] = vi.fn(() => query);
      const now = Date.parse("2026-10-18T12:00:00Z");
      applyCustomerInventory(query, now, {
        observedDays: days,
        includeWithoutPhotos: true,
      });
      expect(query.gte).toHaveBeenCalledWith(
        "last_seen_at",
        new Date(now - days * 86400000).toISOString(),
      );
      expect(query.lte).toHaveBeenCalledWith(
        "last_seen_at",
        new Date(now).toISOString(),
      );
      expect(query.not).not.toHaveBeenCalled();
    },
  );
  it.each([0, -1, 365, NaN, Infinity])(
    "cannot widen inventory through an unsupported window %s",
    (days) => {
      const query: any = {};
      for (const method of ["not", "neq", "gte", "lte", "or"])
        query[method] = vi.fn(() => query);
      const now = Date.parse("2026-10-18T12:00:00Z");
      applyCustomerInventory(query, now, { observedDays: days });
      expect(query.gte).toHaveBeenCalledWith(
        "last_seen_at",
        "2026-10-15T12:00:00.000Z",
      );
    },
  );
  it("rejects stale, unobserved, future and photo-less RPC rows", () => {
    const now = Date.parse("2026-10-13T12:00:00Z");
    const row = {
      images: ["https://dealer.test/car.jpg"],
      last_seen_at: "2026-10-13T11:00:00Z",
    };
    expect(isCustomerInventory(row, now)).toBe(true);
    expect(isCustomerInventory({ ...row, images: [] }, now)).toBe(false);
    expect(isCustomerInventory({ ...row, last_seen_at: null }, now)).toBe(
      false,
    );
    expect(
      isCustomerInventory(
        { ...row, last_seen_at: "2026-10-10T11:59:59Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isCustomerInventory(
        { ...row, last_seen_at: "2026-10-14T00:00:00Z" },
        now,
      ),
    ).toBe(false);
    expect(isCustomerInventory({ ...row, active: false }, now)).toBe(false);
    expect(
      isCustomerInventory(
        { ...row, options: { photoAudit: { state: "unavailable" } } },
        now,
      ),
    ).toBe(false);
    expect(
      isCustomerInventory(
        { ...row, options: { photoAudit: { state: "available" } } },
        now,
      ),
    ).toBe(true);
  });
  it("filters missing photos and stale/future observations before pagination", () => {
    const query: any = {};
    for (const method of ["not", "neq", "gte", "lte", "or"])
      query[method] = vi.fn(() => query);
    expect(
      applyCustomerInventory(query, Date.parse("2026-10-13T12:00:00Z")),
    ).toBe(query);
    expect(query.not).toHaveBeenCalledWith("images", "is", null);
    expect(query.neq).toHaveBeenCalledWith("images", "{}");
    expect(query.or).toHaveBeenCalledWith(
      "options->photoAudit->>state.is.null,options->photoAudit->>state.neq.unavailable",
    );
    expect(query.gte).toHaveBeenCalledWith(
      "last_seen_at",
      "2026-10-10T12:00:00.000Z",
    );
    expect(query.lte).toHaveBeenCalledWith(
      "last_seen_at",
      "2026-10-13T12:00:00.000Z",
    );
  });
  it("rejects blanks, malformed URLs and known placeholders without inventing photos", () => {
    expect(
      listingPhotos([
        null,
        "",
        "bad",
        "data:image/png;base64,x",
        "https://dealer.test/no-image.jpg",
        "https://dealer.test/car.jpg",
        "https://dealer.test/car.jpg",
      ]),
    ).toEqual(["https://dealer.test/car.jpg"]);
    expect(listingPhotos(null)).toEqual([]);
  });
  it("excludes known and audited placeholders but retains unverified real-photo URLs", () => {
    const now = Date.parse("2026-10-21T12:00:00Z");
    const row = {
      last_seen_at: new Date(now).toISOString(),
      images: ["https://dealer.test/no-photo.jpg"],
    };
    expect(isCustomerInventory(row, now)).toBe(false);
    expect(
      isCustomerInventory(
        {
          ...row,
          images: ["https://dealer.test/car.jpg"],
          options: { photoAudit: { state: "unknown" } },
        },
        now,
      ),
    ).toBe(true);
    expect(
      isCustomerInventory(
        {
          ...row,
          images: ["https://dealer.test/car.jpg"],
          options: {
            photoAudit: { placeholderUrls: ["https://dealer.test/car.jpg"] },
          },
        },
        now,
      ),
    ).toBe(false);
  });
  it("lets whole-market research include photo-less records without relaxing freshness", () => {
    const query: any = {};
    for (const method of ["not", "neq", "gte", "lte", "or"])
      query[method] = vi.fn(() => query);
    applyCustomerInventory(query, Date.parse("2026-10-13T12:00:00Z"), {
      includeWithoutPhotos: true,
    });
    expect(query.not).not.toHaveBeenCalled();
    expect(query.neq).not.toHaveBeenCalled();
    expect(query.or).not.toHaveBeenCalled();
    expect(query.gte).toHaveBeenCalledWith(
      "last_seen_at",
      "2026-10-10T12:00:00.000Z",
    );
    expect(query.lte).toHaveBeenCalledWith(
      "last_seen_at",
      "2026-10-13T12:00:00.000Z",
    );
  });
});
