import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  arsenalCuratedSites,
  arsenalEnabledIds,
  buildStateArsenal,
  summarizeArsenal,
} from "./arsenal";
import { STATE_DEALER_CANDIDATES } from "./sources-registry";
import { policyBlockFor } from "./source-compliance";

// These suites pin the terms-safe gate itself. Since 2026-10-09 the default restores the
// operator's sources (OPERATOR_RESTORED_SOURCES / OPERATOR_RESTORED_HOSTS); the gate still runs
// whenever SCRAPE_TERMS_SAFE_ONLY=1, which is what these tests exercise.
beforeEach(() => {
  vi.stubEnv("SCRAPE_TERMS_SAFE_ONLY", "1");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("state arsenal", () => {
  it("never marks a terms-restricted runner source live without SCRAPE_SOURCES", () => {
    const tx = buildStateArsenal("TX", {
      scrapeSources: "",
      arsenalEnable: "",
    });
    const byId = new Map(tx.map((e) => [e.id, e]));
    for (const id of [
      "copart",
      "offerup",
      "municibid",
      "govdeals",
      "allsurplus",
      "carparts_com",
      "craigslist",
    ]) {
      expect(byId.get(id)?.status).toBe("restricted");
      expect(byId.get(id)?.reason).toBeTruthy();
    }
    expect(byId.get("gsa_auctions")?.status).toBe("restricted");
    const optIn = buildStateArsenal("TX", {
      scrapeSources: "copart",
      arsenalEnable: "",
    });
    expect(optIn.find((e) => e.id === "copart")?.status).toBe("restricted");
  });

  it("keeps researched candidates catalog-only until ARSENAL_ENABLE lists the exact id", () => {
    const cand = STATE_DEALER_CANDIDATES[0];
    const st = cand.states![0];
    const off = buildStateArsenal(st, { scrapeSources: "", arsenalEnable: "" });
    expect(off.find((e) => e.id === cand.id)?.status).toBe("blocked");
    expect(arsenalCuratedSites("")).toEqual([]);
    const on = buildStateArsenal(st, {
      scrapeSources: "",
      arsenalEnable: cand.id,
    });
    expect(on.find((e) => e.id === cand.id)?.status).toBe("blocked");
    expect(arsenalCuratedSites(cand.id)).toEqual([]);
    // Whole-state or junk tokens enable nothing.
    expect(arsenalEnabledIds(`state:${st},*,../x`).size).toBe(0);
  });

  it("summarizes every state and rejects bad state codes", () => {
    expect(buildStateArsenal("ZZZ")).toEqual([]);
    const fl = buildStateArsenal("FL", {
      scrapeSources: "",
      arsenalEnable: "",
    });
    const s = summarizeArsenal("FL", fl);
    expect(
      s.live + s.restricted + s.operatorEnabled + s.blocked + s.candidate,
    ).toBe(fl.length);
    expect(
      fl.some((e) => e.origin === "curated" && e.status === "blocked"),
    ).toBe(true);
  });
});
