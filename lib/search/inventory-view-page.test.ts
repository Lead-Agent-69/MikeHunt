import { afterEach, describe, expect, it } from "vitest";
import { invalidate } from "@/lib/cache";
import { inventoryViewPage } from "./inventory-view-page";
import { CATEGORY_PROJECTION } from "./category-inventory";

afterEach(() => invalidate("view-category:"));

function inventory(rows: any[], failDetails = false) {
  const calls: {
    columns: string;
    params: string;
    ids?: string[];
    from?: number;
    to?: number;
  }[] = [];
  const build = (columns: string, params: URLSearchParams) => {
    const call: (typeof calls)[number] = { columns, params: params.toString() };
    calls.push(call);
    const q: any = {
      in: (_key: string, ids: string[]) => {
        call.ids = ids;
        return q;
      },
      range: (from: number, to: number) => {
        call.from = from;
        call.to = to;
        return q;
      },
      then: (resolve: (value: unknown) => unknown) =>
        resolve({
          data: (call.ids
            ? rows.filter((row) => call.ids!.includes(row.id))
            : rows
          ).slice(call.from, (call.to ?? 999) + 1),
          error:
            failDetails && columns !== CATEGORY_PROJECTION
              ? new Error("details unavailable")
              : null,
        }),
    };
    return q;
  };
  return { build, calls };
}

describe("category searches across browse views", () => {
  it("matches SUVs OR pickups without category words and pages after classification", async () => {
    const rows = [
      ...Array.from({ length: 1001 }, (_, id) => ({
        id: String(id),
        make: "Honda",
        model: "Civic",
      })),
      { id: "suv", make: "Ford", model: "Explorer" },
      { id: "pickup", make: "Ford", model: "F-150" },
    ];
    const db = inventory(rows);
    const page = inventoryViewPage(
      db.build,
      new URLSearchParams(
        "q=suv+truck&states=MO,IL&maxPrice=25000&categories=suvs,trucks",
      ),
      "id,images",
    );
    expect((await page(0, 0)).data.map((row: any) => row.id)).toEqual(["suv"]);
    expect((await page(1, 1)).data.map((row: any) => row.id)).toEqual([
      "pickup",
    ]);
    expect(
      db.calls
        .filter((call) => call.columns === CATEGORY_PROJECTION)
        .map((call) => call.from),
    ).toEqual([0, 1000]);
    expect(
      db.calls.every(
        (call) =>
          call.params ===
          "states=MO%2CIL&maxPrice=25000&categories=suvs%2Ctrucks",
      ),
    ).toBe(true);
  });

  it("recognizes common crossovers rather than silently classifying them as sedans", async () => {
    const db = inventory([
      { id: "kia", make: "Kia", model: "Sportage" },
      { id: "lincoln", make: "Lincoln", model: "Corsair" },
      { id: "vw", make: "Volkswagen", model: "Atlas Cross Sport" },
      { id: "gmc", make: "GMC", model: "Terrain" },
      { id: "sedan", make: "Kia", model: "K5" },
    ]);
    expect(
      (
        await inventoryViewPage(
          db.build,
          new URLSearchParams("q=suv"),
          "id",
        )(0, 29)
      ).data.map((row: any) => row.id),
    ).toEqual(["kia", "lincoln", "vw", "gmc"]);
  });

  it("keeps additional literal terms when classifying and bounds detail query URLs", async () => {
    const db = inventory([
      ...Array.from({ length: 251 }, (_, id) => ({
        id: String(id),
        make: "Ford",
        model: "F-150",
      })),
      { id: "other", make: "Toyota", model: "Tacoma" },
    ]);
    const page = inventoryViewPage(
      db.build,
      new URLSearchParams("q=Ford+trucks"),
      "id,images",
    );
    expect((await page(0, 249)).data).toHaveLength(250);
    expect(
      db.calls.filter((call) => call.ids).map((call) => call.ids!.length),
    ).toEqual([100, 100, 50]);
    expect((await page(250, 299)).data.map((row: any) => row.id)).toEqual([
      "250",
    ]);
  });

  it("keeps ordinary model searches on the single database query path", async () => {
    const db = inventory([{ id: "one", model: "F-150" }]);
    await inventoryViewPage(
      db.build,
      new URLSearchParams("q=F-150"),
      "id",
    )(0, 29);
    expect(db.calls).toEqual([
      { columns: "id", params: "q=F-150", from: 0, to: 29 },
    ]);
  });

  it("does not fetch unrelated cars on an empty category match or return success on a detail failure", async () => {
    const db = inventory([{ id: "sedan", make: "Honda", model: "Civic" }]);
    expect(
      (
        await inventoryViewPage(
          db.build,
          new URLSearchParams("q=truck"),
          "id",
        )(0, 29)
      ).data,
    ).toEqual([]);
    expect(db.calls).toHaveLength(1);
    const broken = inventory(
      [{ id: "truck", make: "Ford", model: "F-150" }],
      true,
    );
    await expect(
      inventoryViewPage(
        broken.build,
        new URLSearchParams("q=truck"),
        "id",
      )(0, 29),
    ).rejects.toThrow("details unavailable");
  });

  it("isolates cached category IDs by caller and resolved location partition", async () => {
    const a = inventory([{ id: "a", make: "Ford", model: "F-150" }]);
    const b = inventory([{ id: "b", make: "Ford", model: "Explorer" }]);
    const params = new URLSearchParams("q=suv+truck&radius=50");
    await inventoryViewPage(a.build, params, "id", "user-a:zip63101")(0, 29);
    expect(
      (await inventoryViewPage(b.build, params, "id", "user-a:zip64101")(0, 29))
        .data[0].id,
    ).toBe("b");
    const other = inventory([{ id: "c", make: "Ford", model: "Explorer" }]);
    expect(
      (
        await inventoryViewPage(
          other.build,
          params,
          "id",
          "user-b:zip63101",
        )(0, 29)
      ).data[0].id,
    ).toBe("c");
  });
});
