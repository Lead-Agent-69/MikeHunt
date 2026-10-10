import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  curatedSiteKey,
  loadCuratedRotation,
  planCuratedRotation,
  saveCuratedRotation,
} from "./curated-rotation";

const sites = [
  { url: "https://www.a.example", state: "FL" },
  { url: "https://b.example", state: "FL" },
  { url: "https://c.example", state: "KY" },
  { url: "https://d.example" },
];

describe("curated dealer rotation", () => {
  it("uses demand state order only to break equal attempt ages", () => {
    expect(
      planCuratedRotation(sites, { version: 1, lastAttempted: {} }, [
        "KY",
        "FL",
      ]),
    ).toEqual([sites[2], sites[0], sites[1], sites[3]]);
    expect(
      planCuratedRotation(
        sites,
        { version: 1, lastAttempted: { "c.example": 100 } },
        ["KY"],
      ),
    ).toEqual([sites[3], sites[0], sites[1], sites[2]]);
  });

  it("eventually attempts every dealer even with an unchanged plan and one slot per run", () => {
    const rotation = {
      version: 1 as const,
      lastAttempted: {} as Record<string, number>,
    };
    const seen: string[] = [];
    for (let tick = 1; tick <= sites.length; tick += 1) {
      const picked = planCuratedRotation(sites, rotation, ["FL"])[0];
      const key = curatedSiteKey(picked);
      seen.push(key);
      rotation.lastAttempted[key] = tick;
    }
    expect(new Set(seen).size).toBe(sites.length);
    expect(planCuratedRotation(sites, rotation, ["FL"])[0]).toBe(sites[0]);
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
