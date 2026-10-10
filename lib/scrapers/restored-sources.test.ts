import { describe, expect, it, vi, afterEach } from "vitest";
import {
  OPERATOR_RESTORED_SOURCES,
  isAutomationAllowedSource,
  operatorRestoredSources,
  resolveSweepSources,
} from "./sweep-schedule";
import { resolveCiSources } from "./ci-sources";
import { OPERATOR_RESTORED_HOSTS, policyBlockFor } from "./source-compliance";

afterEach(() => vi.unstubAllEnvs());
describe("operator selection is not source permission", () => {
  it("does not restore unapproved sources, even with the legacy switch off", () => {
    vi.stubEnv("SCRAPE_TERMS_SAFE_ONLY", "");
    vi.stubEnv("SCRAPE_SOURCES", OPERATOR_RESTORED_SOURCES.join(","));
    expect(operatorRestoredSources()).toEqual([]);
    for (const id of OPERATOR_RESTORED_SOURCES)
      expect(isAutomationAllowedSource(id)).toBe(false);
    expect(resolveSweepSources()).toEqual([]);
    expect(resolveCiSources([], "").sources).toEqual(["curated_dealers"]);
  });
  it("keeps curated hosts held without documented permission", () => {
    for (const host of OPERATOR_RESTORED_HOSTS)
      expect(policyBlockFor(`https://www.${host}/inventory`)).toBeDefined();
    expect(policyBlockFor("https://www.autobidmaster.com/")?.kind).toBe(
      "bot_challenge",
    );
  });
  it("cannot authorize an unresolved source using an explicit list", () => {
    expect(resolveSweepSources("gsa_auctions")).toEqual([]);
    expect(isAutomationAllowedSource("copart", "copart")).toBe(false);
    expect(isAutomationAllowedSource("unknown", "unknown")).toBe(false);
  });
});
