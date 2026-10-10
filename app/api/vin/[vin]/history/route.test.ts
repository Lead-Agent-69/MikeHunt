import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  data: [] as any[] | null,
  error: null as any,
  reject: false,
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: () => {
      const q: any = {};
      for (const m of ["select", "eq", "order"]) q[m] = () => q;
      q.limit = async () => {
        if (state.reject) throw new Error("private diagnostic");
        return state;
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/vehicle/vin-history", async (original) => ({
  ...(await original<any>()),
  fetchNmvtis: vi.fn().mockResolvedValue(null),
}));
import { GET } from "./route";
const request = () =>
  GET(new Request("http://localhost/history"), {
    params: Promise.resolve({ vin: "3GCPYJEK6NG154660" }),
  });
beforeEach(() => {
  state.data = [];
  state.error = null;
  state.reject = false;
});
describe("history availability", () => {
  it("distinguishes database failure from no history", async () => {
    state.error = { message: "private diagnostic" };
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private diagnostic");
  });
  it("handles rejected reads", async () => {
    state.reject = true;
    expect((await request()).status).toBe(503);
  });
  it("allows an actual empty history result", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      source: "none",
      authoritative: false,
    });
  });
  it("retains reported damage without claiming independent verification", async () => {
    state.data = [{ source: "recar", damage_type: "repairable" }];
    const data = await (await request()).json();
    expect(data.titleBrands).toContain("Recorded damage: repairable");
    expect(data.note).toContain("1 stored listing sighting.");
    expect(data.authoritative).toBe(false);
  });
});
