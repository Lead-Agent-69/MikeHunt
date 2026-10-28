import { AuthSessionMissingError, AuthApiError } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({
  user: { id: "owner" } as { id: string } | null,
  authError: null as unknown,
  result: { data: null, error: null } as any,
  calls: [] as unknown[][],
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({
    data: { user: state.user },
    error: state.authError,
  }),
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: (table: string) => {
      const query: any = { maybeSingle: async () => state.result };
      for (const method of ["select", "eq", "upsert", "abortSignal"])
        query[method] = (...args: unknown[]) => {
          state.calls.push([table, method, ...args]);
          return query;
        };
      return query;
    },
  }),
}));
import { GET, PUT } from "./route";
const ctx = () => ({ params: Promise.resolve({ id: "car" }) });
const request = (body?: unknown) =>
  new NextRequest("https://app.test/api/deals/car/notes", {
    method: body === undefined ? "GET" : "PUT",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
beforeEach(() => {
  state.user = { id: "owner" };
  state.authError = null;
  state.result = { data: null, error: null };
  state.calls = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
it("does not present a failed read as an empty note or expose backend details", async () => {
  state.result = { data: null, error: { message: "private postgres failure" } };
  const response = await GET(request(), ctx());
  expect(response.status).toBe(503);
  const text = await response.text();
  expect(text).not.toContain('"note"');
  expect(text).not.toContain("postgres");
  expect(text).toContain("could not be loaded");
});
it("returns an empty note only after a successful owner-scoped read", async () => {
  const response = await GET(request(), ctx());
  expect(await response.json()).toEqual({ note: "" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(state.calls).toContainEqual(["watchlist", "eq", "user_id", "owner"]);
  expect(state.calls).toContainEqual(["watchlist", "eq", "deal_id", "car"]);
});
it("distinguishes unavailable authentication from a signed-out session", async () => {
  state.authError = new Error("unavailable");
  expect((await GET(request(), ctx())).status).toBe(503);
  state.authError = null;
  state.user = null;
  expect((await GET(request(), ctx())).status).toBe(401);
  expect((await PUT(request({ note: "a" }), ctx())).status).toBe(401);
  expect(state.calls).toEqual([]);
});
it("rejects malformed writes rather than silently erasing an existing note", async () => {
  for (const body of [{}, { note: null }, { note: 42 }, null])
    expect((await PUT(request(body), ctx())).status).toBe(400);
  expect(state.calls).toEqual([]);
});
it("confirms the actual owner, listing and saved note before success", async () => {
  state.result = {
    data: { user_id: "owner", deal_id: "car", notes: "kept" },
    error: null,
  };
  const response = await PUT(
    request({ note: "kept", user_id: "other" }),
    ctx(),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ note: "kept" });
  expect(state.calls).toContainEqual([
    "watchlist",
    "upsert",
    { user_id: "owner", deal_id: "car", notes: "kept" },
    { onConflict: "user_id,deal_id" },
  ]);
});
it("does not claim success for a no-row, wrong-owner or mismatching confirmation", async () => {
  for (const data of [
    null,
    { user_id: "other", deal_id: "car", notes: "kept" },
    { user_id: "owner", deal_id: "other", notes: "kept" },
    { user_id: "owner", deal_id: "car", notes: "different" },
  ]) {
    state.result = { data, error: null };
    expect((await PUT(request({ note: "kept" }), ctx())).status).toBe(503);
  }
});
it("supports intentional clearing and the existing length limit", async () => {
  state.result = {
    data: { user_id: "owner", deal_id: "car", notes: "" },
    error: null,
  };
  expect((await PUT(request({ note: "" }), ctx())).status).toBe(200);
  const note = "a".repeat(4000);
  state.result.data.notes = note;
  expect((await PUT(request({ note: note + "extra" }), ctx())).status).toBe(
    200,
  );
});

it("returns a sign-in response for the actual SDK missing/expired session errors", async () => {
  state.user = null;
  for (const error of [
    new AuthSessionMissingError(),
    new AuthApiError("expired", 401, undefined),
    new AuthApiError("expired", 400, "refresh_token_not_found"),
  ]) {
    state.authError = error;
    expect((await GET(request(), ctx())).status).toBe(401);
    expect((await PUT(request({ note: "draft" }), ctx())).status).toBe(401);
  }
  expect(state.calls).toEqual([]);
});
