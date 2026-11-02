import { expect, it, vi } from "vitest";
import {
  applyIndividualListingScope,
  isNonVehicleListing,
} from "./individual-listing";
import { customerInventoryExclusion } from "./customer-inventory";

it.each([
  { title: "Check Out These Great Deals!" },
  { title: "Browse Our Inventory" },
  {
    source_url:
      "https://www.hollerhonda.com/searchnew.aspx?make=Honda&model=Odyssey",
  },
])(
  "excludes known promotional/search pages without interpreting them as vehicles: %j",
  (row) => {
    expect(isNonVehicleListing(row)).toBe(true);
    expect(customerInventoryExclusion(row)).toBe("non_vehicle_listing");
  },
);
it.each([
  {
    title: "2024 Ford E-350 - Great Deal!",
    source_url: "https://dealer.test/vehicle/123",
  },
  {
    title: "2015 Honda Odyssey",
    source_url: "https://dealer.test/used-Honda-Odyssey-123",
  },
  { title: null, source_url: null },
])(
  "keeps real individual records and does not reject unknown fields: %j",
  (row) => {
    expect(isNonVehicleListing(row)).toBe(false);
  },
);
it("applies exclusions before counts and pagination using static null-safe filters", () => {
  const q = { or: vi.fn() };
  q.or.mockReturnValue(q);
  expect(applyIndividualListingScope(q)).toBe(q);
  expect(q.or).toHaveBeenCalledTimes(2);
  expect(q.or.mock.calls[0][0]).toContain("title.is.null,title.not.imatch.");
  expect(q.or.mock.calls[1][0]).toContain(
    "source_url.is.null,source_url.not.imatch.",
  );
});
