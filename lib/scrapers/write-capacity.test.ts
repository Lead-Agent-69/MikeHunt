import { expect, it } from "vitest";
import { generalInsertCapacity, writeCapacity } from "./write-capacity";
const quota = {
  inserts: 1000,
  updates: 236,
  touches: 0,
  maxInserts: 1250,
  maxUpdates: 2500,
  maxTouches: 20000,
};
it("retains the insert reserve while allowing existing-row refreshes", () => {
  expect(writeCapacity(quota)).toEqual({
    insertsRemaining: 0,
    updatesRemaining: 1764,
    touchesRemaining: 20000,
    mode: "refresh_only",
    paused: false,
  });
});
it("permits unchanged observations after content updates run out, then pauses", () => {
  expect(writeCapacity({ ...quota, updates: 2000 }).mode).toBe(
    "observations_only",
  );
  expect(
    writeCapacity({ ...quota, updates: 2000, touches: 20000 }),
  ).toMatchObject({ mode: "paused", paused: true });
  expect(writeCapacity({ ...quota, inserts: 0 }).mode).toBe("full");
});
it("fails closed for invalid capacities and does not mutate counters", () => {
  expect(
    writeCapacity({
      ...quota,
      maxInserts: NaN,
      maxUpdates: NaN,
      maxTouches: NaN,
    }).paused,
  ).toBe(true);
  expect(quota.inserts).toBe(1000);
});

it("reserves the last 100 available inserts for dealer jobs within the same limit", () => {
  const warning = { ...quota, maxInserts: 500, inserts: 299 };
  expect(generalInsertCapacity(warning)).toBe(1);
  expect(generalInsertCapacity({ ...warning, inserts: 300 })).toBe(0);
  expect(writeCapacity({ ...warning, inserts: 300 }).insertsRemaining).toBe(
    100,
  );
  expect(writeCapacity({ ...warning, inserts: 400 }).insertsRemaining).toBe(0);
  expect(generalInsertCapacity({ ...warning, maxInserts: 0 })).toBe(0);
});
