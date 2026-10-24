// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { ADMIN_ROUTES } from "@/lib/auth/admin";
import { matchesAnyRoute } from "@/lib/auth/route-match";
import { summarizeDeliveries } from "@/lib/alerts/delivery-summary";

const state = vi.hoisted(() => ({
  admin: false,
  rows: [] as any[],
  from: vi.fn(),
  selected: "" as string,
}));

vi.mock("@/lib/auth/admin-operations", () => ({
  canManageOperations: async () => state.admin,
}));

vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: (t: string) => {
      state.from(t);
      const q: any = {
        select: (cols: string) => {
          state.selected = cols;
          return q;
        },
        gte: () => q,
        order: () => q,
        range: async () => ({ data: state.rows, error: null }),
      };
      return q;
    },
  }),
}));

import { GET } from "./route";

const req = () =>
  new NextRequest("https://x/api/admin/alert-deliveries?days=7");

beforeEach(() => {
  state.admin = false;
  state.rows = [];
  state.from.mockClear();
  state.selected = "";
});

describe("admin alert delivery API", () => {
  it("rejects non-admins before reading anything", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(state.from).not.toHaveBeenCalled();
  });

  it("returns the funnel to admins without user ids or provider ids", async () => {
    state.admin = true;
    state.rows = [
      {
        id: "1",
        channel: "email",
        status: "clicked",
        sent_at: "t",
        delivered_at: "t",
        opened_at: "t",
        clicked_at: "t",
        created_at: "t",
      },
      {
        id: "2",
        channel: "push",
        status: "sent",
        sent_at: "t",
        created_at: "t",
      },
    ];
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(
      body.summary.find((s: any) => s.channel === "email").stages.clicked,
    ).toBe(1);
    expect(state.selected).not.toMatch(/user_id|provider_message_id|error/);
    expect(JSON.stringify(body)).not.toMatch(/user_id|@/);
  });

  it("the page is under an admin-gated route", () => {
    expect(matchesAnyRoute("/admin/alert-delivery", ADMIN_ROUTES)).toBe(true);
    expect(
      readFileSync("app/api/admin/alert-deliveries/route.ts", "utf8"),
    ).toContain("canManageOperations(req)");
  });
});

describe("summarizeDeliveries", () => {
  it("only reports stages a channel can actually observe", () => {
    const s = summarizeDeliveries([
      { channel: "sms", sent_at: "t", clicked_at: "t" },
      { channel: "push", sent_at: "t", delivered_at: "t" },
      { channel: "email", status: "bounced", failed_at: "t" },
    ]);
    const sms = s.find((c) => c.channel === "sms")!;
    expect(sms.stages).toEqual({ sent: 1, clicked: 1 });
    expect(sms.rates.clicked).toBe(1);
    const push = s.find((c) => c.channel === "push")!;
    expect(push.stages.opened).toBeUndefined();
    expect(push.rates.delivered).toBe(1);
    expect(s.find((c) => c.channel === "email")!.failed).toBe(1);
  });
});
