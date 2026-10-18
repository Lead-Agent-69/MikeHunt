import { describe, expect, it, vi } from "vitest";
import {
  applyCustomerInventory,
  isCustomerInventory,
  listingPhotos,
} from "./customer-inventory";

describe("customer inventory eligibility", () => {
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
