import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const inserts = vi.hoisted(() => [] as any[]);
const insertError = vi.hoisted(() => ({ value: null as any }));
const DEAL_ID = "11111111-2222-4333-8444-555555555555";

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: (table: string) => {
      if (table === "deals")
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              maybeSingle: async () => ({
                data:
                  id === DEAL_ID
                    ? {
                        id,
                        make: "Honda",
                        model: "Accord",
                        year: 2018,
                        ask_price: 14500,
                        body_class: "Sedan",
                        location_state: "tx",
                        source: "cars_com",
                        condition: "clean_title",
                      }
                    : null,
              }),
            }),
          }),
        };
      return {
        insert: async (row: any) => {
          inserts.push({ table, row });
          return { error: insertError.value };
        },
      };
    },
  }),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/reco/signal", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );

beforeEach(() => {
  inserts.length = 0;
  insertError.value = null;
  getServerUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("POST /api/reco/signal", () => {
  it("guests get 401 and nothing is written", async () => {
    getServerUser.mockResolvedValue({ data: { user: null } });
    const res = await post({ dealId: DEAL_ID, kind: "open" });
    expect(res.status).toBe(401);
    expect(inserts).toEqual([]);
  });

  it("stores a server-side snapshot, ignoring client attributes", async () => {
    const res = await post({
      dealId: DEAL_ID,
      kind: "open",
      make: "Ferrari",
      price: 1,
    });
    expect(res.status).toBe(202);
    expect(inserts[0]).toMatchObject({
      table: "deal_signals",
      row: {
        user_id: "user-1",
        deal_id: DEAL_ID,
        kind: "open",
        make: "Honda",
        model: "Accord",
        price: 14500,
        state: "TX",
        title_class: "clean",
      },
    });
  });

  it("validates kind, dealId, dwell and facet", async () => {
    expect((await post({ kind: "like" })).status).toBe(400);
    expect((await post({ kind: "open" })).status).toBe(400);
    expect((await post({ kind: "open", dealId: "x" })).status).toBe(400);
    expect(
      (await post({ kind: "dwell", dealId: DEAL_ID, dwellMs: -1 })).status,
    ).toBe(400);
    expect(
      (await post({ kind: "interest_yes", facet: "anything" })).status,
    ).toBe(400);
    expect(
      (
        await post({
          kind: "open",
          dealId: "99999999-2222-4333-8444-555555555555",
        })
      ).status,
    ).toBe(404);
    expect(inserts).toEqual([]);
    const ok = await post({
      kind: "interest_yes",
      facet: "model:honda|accord",
    });
    expect(ok.status).toBe(202);
    expect(inserts[0].row).toMatchObject({
      kind: "interest_yes",
      facet: "model:honda|accord",
      deal_id: null,
    });
  });

  it("a missing table answers 202 ok:false instead of breaking the page", async () => {
    insertError.value = { message: 'relation "deal_signals" does not exist' };
    const res = await post({ dealId: DEAL_ID, kind: "save" });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: false });
  });
});
