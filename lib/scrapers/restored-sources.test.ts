import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SWEEP_SOURCES,
  OPERATOR_RESTORED_SOURCES,
  TOS_RESTRICTED_SOURCES,
  isAutomationAllowedSource,
  operatorRestoredSources,
  resolveSweepSources,
} from "./sweep-schedule";
import { resolveCiSources } from "./ci-sources";
import {
  OPERATOR_RESTORED_HOSTS,
  SITE_POLICY_BLOCKS,
  policyBlockFor,
} from "./source-compliance";

// Jonah 2026-10-09: never remove or disable sources; bring back every market that was turned off.
describe("operator-restored sources (default)", () => {
  beforeEach(() => {
    vi.stubEnv("SCRAPE_TERMS_SAFE_ONLY", "");
    vi.stubEnv("SCRAPE_SOURCES", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("restores exactly the pre-#90 baked SCRAPE_SOURCES list that the terms gate turned off", () => {
    const preNinety =
      "craigslist,offerup,carvana,autotempest,ebay_sold,ebay_motors,cars_com,autotrader,carparts_com,publicsurplus,govdeals,allsurplus,municibid,gsa_auctions,curated_dealers,copart,truecar".split(
        ",",
      );
    const gated = preNinety.filter((id) => TOS_RESTRICTED_SOURCES[id]);
    // Plus visor, added by Jonah 2026-10-10 (operator_override in access-class.ts).
    const addedLater = ["visor"];
    expect([...OPERATOR_RESTORED_SOURCES].sort()).toEqual(
      [...gated, ...addedLater].sort(),
    );
    // Every restricted id is restored except cargurus, which was never in that list: its runner is
    // disabled because CarGurus serves a DataDome captcha we do not bypass. The terms record stays.
    expect(Object.keys(TOS_RESTRICTED_SOURCES).sort()).toEqual(
      [...gated, ...addedLater, "cargurus"].sort(),
    );
  });

  it("lets every restored source run automatically and keeps them in the default sweep", () => {
    for (const id of OPERATOR_RESTORED_SOURCES) {
      expect(isAutomationAllowedSource(id)).toBe(true);
    }
    const sweep = resolveSweepSources();
    for (const id of DEFAULT_SWEEP_SOURCES.filter((id) => id !== "cargurus")) {
      expect(sweep).toContain(id);
    }
    for (const id of [
      "copart",
      "govdeals",
      "publicsurplus",
      "allsurplus",
      "municibid",
      "gsa_auctions",
    ]) {
      expect(sweep).toContain(id);
    }
  });

  it("scrape-ci default includes restored sources and reports them for the run log", () => {
    const sel = resolveCiSources([], "");
    expect(sel.origin).toBe("default");
    expect(sel.sources).toEqual(
      expect.arrayContaining([
        "copart",
        "govdeals",
        "publicsurplus",
        "gsa_auctions",
        "curated_dealers",
      ]),
    );
    expect(sel.optedInRestricted).toEqual(
      expect.arrayContaining(["copart", "govdeals", "publicsurplus"]),
    );
  });

  it("an explicit SCRAPE_SOURCES list still wins over the default", () => {
    expect(resolveSweepSources("gsa_auctions")).toEqual(["gsa_auctions"]);
  });

  it("restores curated hosts blocked only for terms, and keeps bot-challenge blocks", () => {
    for (const host of OPERATOR_RESTORED_HOSTS) {
      expect(SITE_POLICY_BLOCKS[host]?.kind).not.toBe("bot_challenge");
      expect(policyBlockFor(`https://www.${host}/inventory`)).toBeUndefined();
    }
    expect(
      policyBlockFor("https://www.aeofmiami.com/inventory"),
    ).toBeUndefined();
    expect(policyBlockFor("https://www.autobidmaster.com/")?.kind).toBe(
      "bot_challenge",
    );
    expect(policyBlockFor("https://www.repairablevehicles.com/")?.kind).toBe(
      "bot_challenge",
    );
    // Dedicated runners carry these; curated_dealers must not crawl them a second time.
    expect(policyBlockFor("https://www.govdeals.com/")).toBeDefined();
  });
});

describe("SCRAPE_TERMS_SAFE_ONLY kill switch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns to the terms-safe default without a code change", () => {
    vi.stubEnv("SCRAPE_TERMS_SAFE_ONLY", "1");
    vi.stubEnv("SCRAPE_SOURCES", "");
    expect(operatorRestoredSources()).toEqual([]);
    expect(isAutomationAllowedSource("copart")).toBe(false);
    expect(resolveSweepSources()).not.toContain("copart");
    expect(policyBlockFor("https://www.aeofmiami.com/")?.kind).toBe(
      "tos_bans_bots",
    );
  });
});
