import { describe, expect, it } from "vitest";
import { createScraperRegistry } from "./runner";
import { ALL_SOURCES, STATE_DEALER_CANDIDATES } from "./sources-registry";
import { OPERATOR_RESTORED_HOSTS } from "./source-compliance";
import { TOS_RESTRICTED_SOURCES } from "./terms-restricted";
import {
  SOURCE_ACCESS,
  accessClassFor,
  type AccessClass,
} from "./source-access";

const CLASSES: AccessClass[] = [
  "api",
  "allowed",
  "restricted",
  "operator_override",
];

describe("source access classification", () => {
  it("classifies every runner id in createScraperRegistry()", () => {
    const ids = createScraperRegistry()
      .getAll()
      .map((s) => s.id);
    expect(ids.length).toBeGreaterThan(0);
    const missing = ids.filter((id) => !accessClassFor(id));
    expect(missing).toEqual([]);
  });

  it("classifies every ALL_SOURCES entry", () => {
    const missing = ALL_SOURCES.filter((s) => !accessClassFor(s.id, s.url)).map(
      (s) => s.id,
    );
    expect(missing).toEqual([]);
    for (const s of ALL_SOURCES)
      expect(CLASSES).toContain(accessClassFor(s.id, s.url)!.access);
  });

  it("defaults state dealer candidates to allowed pending permission review (unless a host block applies)", () => {
    for (const s of STATE_DEALER_CANDIDATES) {
      const a = accessClassFor(s.id, s.url)!;
      expect(["allowed", "restricted"]).toContain(a.access);
    }
  });

  it("marks every OPERATOR_RESTORED_HOSTS host operator_override", () => {
    for (const host of OPERATOR_RESTORED_HOSTS) {
      expect(
        accessClassFor("curated_dealers", `https://${host}/inventory`)?.access,
      ).toBe("operator_override");
      expect(
        accessClassFor("curated_dealers", `https://www.${host}/`)?.access,
      ).toBe("operator_override");
    }
  });

  it("never classifies a terms-restricted source as allowed or api", () => {
    for (const id of Object.keys(TOS_RESTRICTED_SOURCES)) {
      expect(["restricted", "operator_override"]).toContain(
        accessClassFor(id)?.access,
      );
    }
  });

  it("classifies every robotsExempt source operator_override (once SourceConfig.robotsExempt exists)", () => {
    const exempt = ALL_SOURCES.filter(
      (s) => (s as { robotsExempt?: boolean }).robotsExempt,
    );
    for (const s of exempt) {
      expect({ id: s.id, access: accessClassFor(s.id, s.url)?.access }).toEqual(
        {
          id: s.id,
          access: "operator_override",
        },
      );
    }
  });

  it("leaves an unregistered source unclassified so the coverage tests fail for it", () => {
    expect(accessClassFor("brand_new_source")).toBeUndefined();
  });

  it("gives every entry a basis note", () => {
    for (const [id, a] of Object.entries(SOURCE_ACCESS)) {
      expect({ id, ok: a.accessBasis.trim().length > 0 }).toEqual({
        id,
        ok: true,
      });
    }
  });
});
