// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => [] as { to: string; html: string }[]);
vi.mock("@/lib/notifications/email", () => ({
  sendEmail: async (m: { to: string; html: string }) => {
    sent.push(m);
    return { success: true };
  },
}));

import {
  DIGEST_ROWS_PER_USER,
  sendSavedSearchDigests,
} from "@/lib/alerts/saved-search-digest";

function fakeSb(searches: any[], rows: any[]) {
  const calls = { order: [] as unknown[][], stamped: [] as string[][] };
  const sb: any = {
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { email: `${id}@example.test` } },
        }),
      },
    },
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        in: (_k: string, v: string[]) => {
          if (q._update) calls.stamped.push(v);
          return q;
        },
        is: () => q,
        gte: () => q,
        order: (...a: unknown[]) => {
          calls.order.push(a);
          return q;
        },
        update: () => {
          q._update = true;
          return q;
        },
        limit: async () => ({ data: rows, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            table === "user_saved_searches"
              ? { data: searches, error: null }
              : { data: null, error: null },
          ).then(resolve),
      };
      return q;
    },
  };
  return { sb, calls };
}

const row = (id: string, user: string, search: string, make = "Honda") => ({
  id,
  user_id: user,
  search_id: search,
  deal_id: `d-${id}`,
  deals: { id: `d-${id}`, year: 2020, make, model: "Civic", ask_price: 1 },
});

beforeEach(() => {
  sent.length = 0;
});

describe("sendSavedSearchDigests", () => {
  it("orders by created_at and never shows another user's search name", async () => {
    const searches = [
      {
        id: "s-a",
        user_id: "ua",
        name: "Alice secret search",
        notify_email: true,
      },
      { id: "s-b", user_id: "ub", name: "Bob search", notify_email: true },
    ];
    // A row for user b pointing at user a's search must be dropped, not labeled with a's name.
    const rows = [row("1", "ub", "s-b"), row("2", "ub", "s-a", "Toyota")];
    const { sb, calls } = fakeSb(searches, rows);
    const res = await sendSavedSearchDigests(sb);
    expect(calls.order).toContainEqual(["created_at", { ascending: false }]);
    expect(res.emailsSent).toBe(1);
    expect(sent[0].to).toBe("ub@example.test");
    expect(sent[0].html).toContain("Bob search");
    expect(sent[0].html).not.toContain("Alice secret search");
    expect(sent[0].html).not.toContain("Toyota");
    expect(calls.stamped).toEqual([["1"]]);
  });

  it("caps rows per user and stamps only the included ones", async () => {
    const searches = [
      { id: "s-a", user_id: "ua", name: "A", notify_email: true },
    ];
    const rows = Array.from({ length: DIGEST_ROWS_PER_USER + 7 }, (_, i) =>
      row(String(i), "ua", "s-a"),
    );
    const { sb, calls } = fakeSb(searches, rows);
    const res = await sendSavedSearchDigests(sb);
    expect(res.rows).toBe(DIGEST_ROWS_PER_USER);
    expect(calls.stamped[0]).toHaveLength(DIGEST_ROWS_PER_USER);
  });
});
