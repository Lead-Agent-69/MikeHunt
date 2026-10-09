import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const from = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from }),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: { id: "current" } } }),
}));
vi.mock("@/lib/reco/signals", () => ({ recordDealSignal: vi.fn() }));
import { POST } from "./route";
describe("account save session continuity", () => {
  it("rejects a stale account before saving or reading a deal", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/saved-cars", {
        method: "POST",
        headers: { "X-Save-Owner": "previous" },
        body: JSON.stringify({ dealId: "deal" }),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).not.toHaveProperty("id");
    expect(from).not.toHaveBeenCalled();
  });
});
