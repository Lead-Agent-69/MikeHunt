import { expect, it } from "vitest";
import { reportedPrice } from "./reported-price";
it.each([0, -1, null, undefined, NaN, Infinity, "", "invalid"])(
  "keeps %s unknown rather than showing a free car",
  (value) => {
    expect(reportedPrice(value)).toBe("Not reported");
  },
);
it("formats a reported price", () =>
  expect(reportedPrice(12000)).toBe("$12,000"));
