import { describe, expect, it } from "vitest";
import { createScraperRegistry } from "./runner";
import { ALL_SOURCES, STATE_DEALER_CANDIDATES } from "./sources-registry";
import { OPERATOR_RESTORED_HOSTS } from "./source-compliance";
import { TOS_RESTRICTED_SOURCES } from "./terms-restricted";
import {
  SOURCE_ACCESS,
  accessClassFor,
  sourceAccessFor,
  type AccessClass,
} from "./access-class";

const CLASSES: AccessClass[] = [
  "api",
  "allowed",
  "restricted",
  "operator_override",
  "unreviewed",
];

// Coverage uses the raw lookup (sourceAccessFor): an unclassified id is undefined and fails here.
// Runtime callers fail closed to "unreviewed" instead.
describe("source access classification", () => {
  it("classifies every runner id in createScraperRegistry()", () => {
    const ids = createScraperRegistry()
      .getAll()
      .map((s) => s.id);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(ids.filter((id) => !sourceAccessFor(id))).toEqual([]);
  });

  it("classifies every ALL_SOURCES entry", () => {
    expect(ALL_SOURCES.length).toBeGreaterThanOrEqual(1);
    expect(
      ALL_SOURCES.filter((s) => !sourceAccessFor(s.id, s.url)).map((s) => s.id),
    ).toEqual([]);
    for (const s of ALL_SOURCES)
      expect(CLASSES).toContain(sourceAccessFor(s.id, s.url)!.access);
  });

  it("defaults state dealer candidates to allowed pending review (unless a host block applies)", () => {
    expect(STATE_DEALER_CANDIDATES.length).toBeGreaterThanOrEqual(1);
    for (const s of STATE_DEALER_CANDIDATES)
      expect(["allowed", "restricted"]).toContain(
        sourceAccessFor(s.id, s.url)!.access,
      );
  });

  it("marks every OPERATOR_RESTORED_HOSTS host operator_override", () => {
    expect(OPERATOR_RESTORED_HOSTS.length).toBeGreaterThanOrEqual(1);
    for (const host of OPERATOR_RESTORED_HOSTS) {
      for (const url of [`https://${host}/inventory`, `https://www.${host}/`]) {
        expect(sourceAccessFor("curated_dealers", url)?.access).toBe(
          "operator_override",
        );
        expect(
          accessClassFor({ source: "independent_dealer", source_url: url }),
        ).toBe("operator_override");
      }
    }
  });

  it("never classifies a terms-restricted source as allowed, api or unreviewed", () => {
    const ids = Object.keys(TOS_RESTRICTED_SOURCES);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    for (const id of ids)
      expect(["restricted", "operator_override"]).toContain(
        sourceAccessFor(id)?.access,
      );
  });

  it("classifies all 8 robotsExempt sources operator_override", () => {
    const exempt = ALL_SOURCES.filter(
      (s) => (s as { robotsExempt?: boolean }).robotsExempt,
    );
    expect(exempt.map((s) => s.id).sort()).toHaveLength(8);
    for (const s of exempt)
      expect({
        id: s.id,
        access: sourceAccessFor(s.id, s.url)?.access,
      }).toEqual({ id: s.id, access: "operator_override" });
  });

  it("Ren #290 review: BaT and car-parts.com restricted; iaa/truecar/vroom unreviewed; curated mixed", () => {
    expect(sourceAccessFor("bring-a-trailer")?.access).toBe("restricted");
    expect(sourceAccessFor("car-parts-com")?.access).toBe("restricted");
    for (const id of ["iaa", "truecar", "vroom"])
      expect(sourceAccessFor(id)?.access).toBe("unreviewed");
    expect(SOURCE_ACCESS.curated_dealers.mixed).toBe(true);
  });

  it("leaves an unregistered id unclassified in the raw lookup, unreviewed per row", () => {
    expect(sourceAccessFor("brand_new_source")).toBeUndefined();
    expect(
      accessClassFor({
        source: "brand_new_source",
        source_url: "https://x.example/1",
      }),
    ).toBe("unreviewed");
  });

  it("gives every entry a basis note", () => {
    const entries = Object.entries(SOURCE_ACCESS);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const [id, a] of entries)
      expect({ id, ok: a.accessBasis.trim().length > 0 }).toEqual({
        id,
        ok: true,
      });
  });
});
