import { expect, it, vi } from "vitest";
import { preserveListingPhotos } from "./preserve-listing-photos";

it("keeps quarantine for identical URLs but permits a genuinely new gallery", async () => {
  const audit = { state: "unavailable", checkedAt: "2026-10-14T00:00:00Z" };
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data: [
        {
          source_deal_id: "123",
          source_url: "https://dealer.example/123",
          images: ["/1.jpg", "/2.jpg"],
          photo_audit: audit,
        },
      ],
      error: null,
    }),
  };
  const rows = [
    {
      source: "dealer",
      source_deal_id: "123",
      source_url: "https://dealer.example/123",
      images: ["/1.jpg", "/2.jpg"],
      options: { title: "reported" } as Record<string, unknown>,
    },
  ];
  await preserveListingPhotos({ from: () => query }, rows);
  expect(rows[0].options).toEqual({ title: "reported", photoAudit: audit });
  const changed = [{ ...rows[0], images: ["/new.jpg"], options: {} }];
  await preserveListingPhotos({ from: () => query }, changed);
  expect(changed[0].options).toEqual({});
});

it("retains a captured gallery only for the identical source/listing and matching thumbnail", async () => {
  const stored = [
    {
      source_deal_id: "123",
      source_url: "https://dealer.example/123",
      images: ["/1.jpg", "/2.jpg"],
    },
  ];
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: stored, error: null }),
  };
  const client = { from: vi.fn(() => query) };
  const rows = [
    {
      source: "dealer",
      source_deal_id: "123",
      source_url: "https://dealer.example/123",
      images: ["/1.jpg"],
    },
    {
      source: "dealer",
      source_deal_id: "456",
      source_url: "https://dealer.example/456",
      images: ["/1.jpg"],
    },
  ];
  await preserveListingPhotos(client, rows);
  expect(query.eq).toHaveBeenCalledWith("source", "dealer");
  expect(rows[0].images).toEqual(["/1.jpg", "/2.jpg"]);
  expect(rows[1].images).toEqual(["/1.jpg"]);
  const changed = [{ ...rows[0], images: ["/new.jpg"] }];
  await preserveListingPhotos(client, changed);
  expect(changed[0].images).toEqual(["/new.jpg"]);
  const otherUrl = [
    { ...rows[0], source_url: "https://other.example/123", images: ["/1.jpg"] },
  ];
  await preserveListingPhotos(client, otherUrl);
  expect(otherUrl[0].images).toEqual(["/1.jpg"]);
});

it("checks complete galleries for quarantine metadata and surfaces failed lookups", async () => {
  const initial = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const client = { from: vi.fn(() => initial) };
  await preserveListingPhotos(client, [
    {
      source: "dealer",
      source_deal_id: "123",
      source_url: "https://dealer.example/123",
      images: ["/1.jpg", "/2.jpg"],
    },
  ]);
  expect(client.from).toHaveBeenCalledTimes(1);
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error("lookup failed") }),
  };
  client.from.mockReturnValue(query);
  await expect(
    preserveListingPhotos(client, [
      {
        source: "dealer",
        source_deal_id: "123",
        source_url: "https://dealer.example/123",
        images: [],
      },
    ]),
  ).rejects.toThrow("lookup failed");
});
