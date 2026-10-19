import { describe, expect, it } from "vitest";
import {
  abandonedJob,
  INTERRUPTED_SEARCH_MESSAGE,
  recoverAbandonedScopedJobs,
} from "./job-recovery";

const now = Date.parse("2026-10-19T06:00:00Z");
const old = (id = "old") => ({
  id,
  status: "running",
  worker_id: "old-worker",
  started_at: "2026-10-17T00:00:00Z",
  heartbeat_at: "2026-10-17T00:00:00Z",
  result: { partial: "retained" },
});
function fake(
  initial: Record<string, any>[],
  hooks: {
    beforeWrite?: (rows: Record<string, any>[]) => void;
    readError?: boolean;
    writeError?: boolean;
  } = {},
) {
  const rows = initial.map((r) => ({ ...r }));
  const patches: Record<string, any>[] = [];
  const db = {
    from: () => {
      const filters: ((row: Record<string, any>) => boolean)[] = [];
      let patch: Record<string, any> | undefined;
      let take = 25;
      const q: any = {
        select: () => q,
        order: () => q,
        limit: (n: number) => {
          take = n;
          return q;
        },
        eq: (k: string, v: unknown) => {
          filters.push((r) => r[k] === v);
          return q;
        },
        is: (k: string, v: unknown) => {
          filters.push((r) => r[k] === v);
          return q;
        },
        lte: (k: string, v: string) => {
          filters.push(
            (r) => r[k] != null && Date.parse(r[k]) <= Date.parse(v),
          );
          return q;
        },
        update: (p: Record<string, any>) => {
          patch = p;
          return q;
        },
        abortSignal: async () => {
          if (patch) hooks.beforeWrite?.(rows);
          const error = (patch ? hooks.writeError : hooks.readError)
            ? { message: "unavailable" }
            : null;
          const matches = error
            ? []
            : rows.filter((r) => filters.every((f) => f(r))).slice(0, take);
          if (patch && !error) {
            patches.push(patch);
            matches.forEach((r) => Object.assign(r, patch));
          }
          return { data: matches.map((r) => ({ ...r })), error };
        },
      };
      return q;
    },
  };
  return { db: db as any, rows, patches };
}

describe("abandoned scoped jobs", () => {
  it("recovers stale heartbeat and legacy jobs without deleting results or replaying searches", async () => {
    const f = fake([
      old(),
      { ...old("legacy"), heartbeat_at: null },
      { ...old("fresh"), heartbeat_at: new Date(now).toISOString() },
    ]);
    expect(await recoverAbandonedScopedJobs(f.db, { now })).toBe(2);
    expect(f.rows[0]).toMatchObject({
      status: "failed",
      result: { partial: "retained" },
      error_message: INTERRUPTED_SEARCH_MESSAGE,
    });
    expect(f.rows[1].status).toBe("failed");
    expect(f.rows[2].status).toBe("running");
    expect(f.patches.every((p) => p.status !== "pending")).toBe(true);
  });
  it.each([
    { heartbeat_at: "invalid" },
    { started_at: null },
    { started_at: "2026-10-20T00:00:00Z" },
    { heartbeat_at: null, started_at: "2026-10-19T05:00:00Z" },
    { heartbeat_at: "2026-10-19T05:59:00Z" },
  ])("does not expire invalid or recent leases: %j", (patch) => {
    expect(abandonedJob({ ...old(), ...patch }, now)).toBe(false);
  });
  it.each([
    { heartbeat_at: new Date(now).toISOString() },
    { worker_id: "new-worker" },
    { status: "completed" },
    { started_at: new Date(now).toISOString() },
  ])(
    "lets concurrent heartbeat, ownership, and completion changes win: %j",
    (patch) => {
      const f = fake([old()], {
        beforeWrite: (rows) => Object.assign(rows[0], patch),
      });
      return recoverAbandonedScopedJobs(f.db, { now }).then((result) => {
        expect(result).toBe(0);
        expect(f.rows[0]).toMatchObject(patch);
      });
    },
  );
  it("protects the caller's known active job", async () => {
    const f = fake([old()]);
    expect(
      await recoverAbandonedScopedJobs(f.db, { now, activeJobId: "old" }),
    ).toBe(0);
    expect(f.patches).toHaveLength(0);
  });
  it("bounds a recovery pass to 25 jobs", async () => {
    const f = fake(Array.from({ length: 30 }, (_, i) => old(String(i))));
    expect(await recoverAbandonedScopedJobs(f.db, { now })).toBe(25);
    expect(f.rows.filter((r) => r.status === "running")).toHaveLength(5);
  });
  it.each([{ readError: true }, { writeError: true }])(
    "does not report database failure as recovery: %j",
    async (hooks) => {
      const f = fake([old()], hooks);
      await expect(recoverAbandonedScopedJobs(f.db, { now })).rejects.toThrow(
        "Queue recovery",
      );
      expect(f.rows[0].status).toBe("running");
    },
  );
});
