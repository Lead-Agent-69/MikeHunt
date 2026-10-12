import { expect, it } from "vitest";
import { mileageCurvePrice } from "./mileage-curve";

const trend = [
  { mileage: 20000, price: 20000 },
  { mileage: 100000, price: 12000 },
];
it("anchors the curve at the first observation, not zero miles", () => {
  expect(mileageCurvePrice(trend, 20000)).toBe(20000);
  expect(mileageCurvePrice(trend, 60000)).toBe(16000);
  expect(mileageCurvePrice(trend, 100000)).toBe(12000);
  expect(mileageCurvePrice([...trend].reverse(), 60000)).toBe(16000);
});
it.each([undefined, null, -1, NaN, Infinity, 0, 200000])(
  "does not extrapolate or manufacture a price for mileage %s",
  (mileage) => {
    expect(mileageCurvePrice(trend, mileage)).toBeNull();
  },
);
it("rejects incomplete, degenerate and impossible curve inputs", () => {
  expect(mileageCurvePrice([], 20000)).toBeNull();
  expect(mileageCurvePrice([trend[0]], 20000)).toBeNull();
  expect(mileageCurvePrice([trend[0], trend[0]], 20000)).toBeNull();
  expect(
    mileageCurvePrice([{ mileage: 0, price: NaN }, trend[1]], 20000),
  ).toBeNull();
  expect(
    mileageCurvePrice([{ mileage: 0, price: -10 }, trend[1]], 20000),
  ).toBeNull();
});
