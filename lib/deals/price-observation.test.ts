import { expect, it } from "vitest";
import { bidStatusNote } from "./price-observation";
const now = Date.parse("2026-10-21T12:00:00Z");
it("does not call an ended auction open", () => {
  expect(bidStatusNote("2026-10-21T11:00:00Z", now)).toContain(
    "auction has ended",
  );
  expect(bidStatusNote(new Date(now).toISOString(), now)).toContain(
    "auction has ended",
  );
});
it.each([null, undefined, "", "bad-date"])(
  "labels unconfirmed auction timing (%s)",
  (value) => {
    expect(bidStatusNote(value, now)).toContain("timing is unconfirmed");
  },
);
it("keeps future bids provisional", () => {
  expect(bidStatusNote("2026-10-22T12:00:00Z", now)).toBe(
    "Current bid; final purchase amount and fees can change.",
  );
});
