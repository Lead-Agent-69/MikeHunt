import { describe, expect, it } from "vitest";
import { STATE_SEED_ZIPS, US_STATES } from "@/lib/geo";
import { zipToState } from "@/lib/geo/zip-state";
import {
  STATE_METRO_ZIPS,
  SWEEP_STATE_CODES,
  metroZipsForState,
} from "./metro-zips";

describe("STATE_METRO_ZIPS", () => {
  it("covers all 50 states plus DC", () => {
    for (const state of US_STATES) expect(STATE_METRO_ZIPS[state]).toBeTruthy();
    expect(STATE_METRO_ZIPS.DC).toEqual(["20001"]);
    expect(SWEEP_STATE_CODES).toHaveLength(51);
  });

  it("starts every state at its original seed ZIP", () => {
    for (const state of US_STATES)
      expect(STATE_METRO_ZIPS[state][0]).toBe(STATE_SEED_ZIPS[state]);
  });

  it("only lists real 5-digit ZIPs inside their own state, with no repeats", () => {
    for (const [state, zips] of Object.entries(STATE_METRO_ZIPS)) {
      expect(new Set(zips).size).toBe(zips.length);
      for (const zip of zips) {
        expect(zip).toMatch(/^\d{5}$/);
        expect(zipToState(zip)).toBe(state);
      }
    }
  });

  it("gives the biggest states several search centers", () => {
    expect(STATE_METRO_ZIPS.TX.length).toBeGreaterThanOrEqual(8);
    expect(STATE_METRO_ZIPS.CA.length).toBeGreaterThanOrEqual(5);
    expect(STATE_METRO_ZIPS.FL.length).toBeGreaterThanOrEqual(5);
  });
});

describe("metroZipsForState", () => {
  it("returns count ZIPs from the offset and wraps", () => {
    expect(metroZipsForState("NV", 2, 0)).toEqual(["89101", "89501"]);
    expect(metroZipsForState("AZ", 2, 2)).toEqual(["86001", "85004"]);
    expect(metroZipsForState("tx", 1, 10)).toEqual(["75201"]);
  });

  it("never returns more ZIPs than the state has", () => {
    expect(metroZipsForState("RI", 5, 3)).toEqual(["02903"]);
    expect(metroZipsForState("ZZ", 2, 0)).toEqual([]);
  });
});
