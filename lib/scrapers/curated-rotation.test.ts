import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  curatedSiteKey,
  curatedPriorityStates,
  loadCuratedRotation,
  planCuratedRotation,
  recordCuratedAttempt,
  saveCuratedRotation,
} from "./curated-rotation";

const sites = [
  { url: "https://www.a.example", state: "FL" },
  { url: "https://b.example", state: "FL" },
  { url: "https://c.example", state: "KY" },
  { url: "https://d.example" },
];

describe("curated dealer rotation", () => {
  it("keeps actual user-demand states distinct from national baseline states", () => {
    expect(
      curatedPriorityStates({
        states: ["MO", "IL", "CA"],
        demandStates: ["MO", "IL", "TX"],
      }),
    ).toEqual(["MO", "IL"]);
    expect(curatedPriorityStates({ states: ["MO", "IL"] })).toEqual([
      "MO",
      "IL",
    ]);
    expect(curatedPriorityStates(undefined)).toEqual([]);
    expect(
      curatedPriorityStates({
        states: ["MO", null, "invalid"],
        demandStates: "MO",
      }),
    ).toEqual(["MO"]);
    expect(
      curatedPriorityStates({ states: "MO", demandStates: ["MO"] }),
    ).toEqual([]);
  });
  it("gives planned markets two slots before wider coverage, even when other markets are older", () => {
    expect(
      planCuratedRotation(sites, { version: 1, lastAttempted: {} }, [
        "KY",
        "FL",
      ]),
    ).toEqual([sites[2], sites[0], sites[3], sites[1]]);
    expect(
      planCuratedRotation(
        sites,
        { version: 1, lastAttempted: { "c.example": 100 } },
        ["KY"],
      ),
    ).toEqual([sites[2], sites[3], sites[0], sites[1]]);
  });

  it("eventually attempts every dealer even with an unchanged plan and one slot per run", () => {
    const rotation = {
      version: 1 as const,
      lastAttempted: {} as Record<string, number>,
    };
    const seen: string[] = [];
    for (let tick = 1; tick <= 6; tick += 1) {
      const picked = planCuratedRotation(sites, rotation, ["FL"])[0];
      const key = curatedSiteKey(picked);
      seen.push(key);
      recordCuratedAttempt(rotation, picked, ["FL"], tick);
    }
    expect(new Set(seen).size).toBe(sites.length);
    expect(planCuratedRotation(sites, rotation, ["FL"])[0]).toBe(sites[0]);
  });

  it("preserves the wider slot across interrupted, one-attempt runs and restarts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "curated-slots-"));
    const file = path.join(dir, "rotation.json");
    try {
      let rotation = { version: 1 as const, lastAttempted: {} };
      const picked: string[] = [];
      for (let tick = 1; tick <= 6; tick++) {
        const site = planCuratedRotation(sites, rotation, ["FL"])[0];
        picked.push(site.state || "wider");
        recordCuratedAttempt(rotation, site, ["FL"], tick);
        await saveCuratedRotation(rotation, file);
        rotation = await loadCuratedRotation(file);
      }
      expect(picked).toEqual(["FL", "FL", "wider", "FL", "FL", "KY"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps pure oldest-first rotation without a market plan, and never drops a dealer", () => {
    const rotation = {
      version: 1 as const,
      lastAttempted: { "a.example": 100 },
      preferredStreak: 2,
    };
    expect(planCuratedRotation(sites, rotation)).toEqual([
      sites[1],
      sites[2],
      sites[3],
      sites[0],
    ]);
    for (const states of [["FL"], ["KY"], ["FL", "KY"], ["TX"]]) {
      const picked = planCuratedRotation(sites, rotation, states);
      expect(picked).toHaveLength(sites.length);
      expect(new Set(picked)).toEqual(new Set(sites));
    }
  });

  it("normalizes www hosts without collapsing distinct dealer subdomains", () => {
    expect(curatedSiteKey(sites[0])).toBe("a.example");
    expect(
      curatedSiteKey({ url: "https://rebuilders.a.example/vehicles.php" }),
    ).toBe("rebuilders.a.example");
  });

  it("persists attempts across worker restarts and rejects corrupt state", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "curated-rotation-"));
    const file = path.join(dir, "rotation.json");
    try {
      expect(await loadCuratedRotation(file)).toEqual({
        version: 1,
        lastAttempted: {},
      });
      await saveCuratedRotation(
        { version: 1, lastAttempted: { "a.example": 100 } },
        file,
      );
      expect(
        JSON.parse(await readFile(file, "utf8")).lastAttempted["a.example"],
      ).toBe(100);
      expect(
        planCuratedRotation(sites, await loadCuratedRotation(file))[0],
      ).toBe(sites[1]);
      await writeFile(
        file,
        JSON.stringify({
          version: 1,
          lastAttempted: { valid: 100, bad: "oops", negative: -1 },
        }),
      );
      expect((await loadCuratedRotation(file)).lastAttempted).toEqual({
        valid: 100,
      });
      await writeFile(file, JSON.stringify({ version: 2, lastAttempted: {} }));
      expect((await loadCuratedRotation(file)).lastAttempted).toEqual({});
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
