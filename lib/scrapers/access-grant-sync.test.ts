import { describe, expect, it, vi } from "vitest";
import { ACCESS_POLICY_REVISION, type AccessGrant } from "./access-policy";
import {
  planAccessGrantSync,
  synchronizeAccessGrants,
} from "./access-grant-sync";

const grant: AccessGrant = {
  sourceId: "dealer",
  host: "dealer.example",
  route: "feed",
  evidence: "https://dealer.example/terms",
  reviewedAt: "2026-10-01",
  expiresAt: "2099-01-01",
  collect: true,
  display: true,
  derive: false,
};
const row = {
  source_id: grant.sourceId,
  host: grant.host,
  route: grant.route,
  evidence: grant.evidence,
  reviewed_at: "2026-10-01T00:00:00+00:00",
  expires_at: "2099-01-01T00:00:00+00:00",
  can_collect: true,
  can_display: true,
  can_derive: false,
  policy_revision: ACCESS_POLICY_REVISION,
};

describe("permission synchronization continuity", () => {
  it("does not revoke an identical grant merely because timestamps are formatted differently", () => {
    expect(planAccessGrantSync([row], [grant])).toEqual({
      revoke: [],
      upsert: [],
      unchanged: 1,
    });
  });
  it("revokes removed/changed rights and only inserts genuinely new or changed grants", () => {
    expect(planAccessGrantSync([row], []).revoke).toEqual([row]);
    const changed = planAccessGrantSync([row], [{ ...grant, derive: true }]);
    expect(changed.revoke).toEqual([row]);
    expect(changed.upsert).toHaveLength(1);
    expect(planAccessGrantSync([], [grant]).revoke).toEqual([]);
    expect(() => planAccessGrantSync([], [grant, grant])).toThrow("Duplicate");
  });
  it("keeps changed rights revoked when replacement fails, scoped to the exact route", async () => {
    const calls: unknown[] = [];
    const from = vi.fn(() => ({
      select: () => ({
        range: async () => ({ data: [row], count: 1, error: null }),
      }),
      update: (patch: unknown) => {
        calls.push(patch);
        const builder = {
          eq: (field: string, value: string) => {
            calls.push([field, value]);
            return builder;
          },
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(resolve),
        };
        return builder;
      },
      upsert: async () => {
        calls.push("upsert");
        return { error: new Error("offline") };
      },
    }));
    await expect(
      synchronizeAccessGrants({ from } as any, [{ ...grant, derive: true }]),
    ).rejects.toThrow("remain revoked");
    expect(calls).toEqual([
      { can_collect: false, can_display: false, can_derive: false },
      ["source_id", "dealer"],
      ["host", "dealer.example"],
      ["route", "feed"],
      "upsert",
    ]);
  });
  it("does not write if the policy table was truncated or unreadable", async () => {
    const update = vi.fn();
    const from = vi.fn(() => ({
      select: () => ({
        range: async () => ({ data: [row], count: 2001, error: null }),
      }),
      update,
    }));
    await expect(synchronizeAccessGrants({ from } as any, [])).rejects.toThrow(
      "complete",
    );
    expect(update).not.toHaveBeenCalled();
  });
});
