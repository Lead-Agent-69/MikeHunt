"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/shared/ErrorState";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import {
  PURCHASE_CHECKLIST_KEY,
  fetchPurchaseChecklist,
} from "@/lib/saved/purchase-checklist";

type PurchaseSave = {
  id: string;
  deal_id?: string | null;
  source_url?: string | null;
  status: string;
  tags?: string[];
  snapshot: { year?: number; make?: string; model?: string };
};
const stages = ["Considering", "Inspecting", "Ready to purchase", "Purchased"];
const tasks = [
  "Ask seller about condition",
  "Verify VIN and title documents",
  "Arrange independent inspection",
  "Confirm repairs and total costs",
  "Arrange payment and transport",
];

export function PurchasePipeline() {
  // Same key FlipDeskGate preloads while preferences resolve (lib/saved/purchase-checklist).
  const { data, error, isLoading, mutate } = useSWR<PurchaseSave[]>(
    PURCHASE_CHECKLIST_KEY,
    fetchPurchaseChecklist,
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState("All stages");
  const [writeError, setWriteError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const stageOf = (save: PurchaseSave) => {
    if (save.status === "acquired") return "Purchased";
    const stored = save.tags
      ?.find((tag) => tag.startsWith("purchase-stage:"))
      ?.slice(15);
    return stored && stages.includes(stored) ? stored : "Considering";
  };

  async function update(
    save: PurchaseSave,
    tags: string[],
    status = save.status,
  ) {
    if (saving) return;
    setSaving(save.id);
    setWriteError(null);
    try {
      const response = await fetch(
        `/api/saved-cars/${encodeURIComponent(save.id)}`,
        {
          method: "PUT",
          signal: AbortSignal.timeout(20000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags, status }),
        },
      );
      if (!response.ok)
        throw new Error("Your changes could not be saved. Please try again.");
      const confirmed = await response.json();
      if (
        confirmed.id !== save.id ||
        confirmed.status !== status ||
        !Array.isArray(confirmed.tags) ||
        !tags.every((tag) => confirmed.tags.includes(tag)) ||
        confirmed.tags.length !== tags.length
      )
        throw new Error(
          "Your changes were not confirmed. Reload the plan before retrying.",
        );
      await mutate();
    } catch (error) {
      const message = userFacingErrorMessage(
        error,
        "Your changes were not confirmed. Reload the plan before retrying.",
      );
      setWriteError({ id: save.id, message });
      toast.error(message);
    } finally {
      setSaving(null);
    }
  }

  const saves = (data || []).filter(
    (save) => !["archived", "passed"].includes(save.status),
  );
  const visibleSaves = saves.filter(
    (save) => stageFilter === "All stages" || stageOf(save) === stageFilter,
  );
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Purchase plan</h1>
      <p className="text-sm text-[var(--t3)]">
        Inspection and purchase tasks for your saved vehicles. Purchased is your
        recorded status, not a payment or verified transfer.
      </p>
      <div className="flex flex-wrap gap-3 items-center">
        <label htmlFor="purchase-stage-filter">Stage</label>
        <select
          id="purchase-stage-filter"
          className="min-h-11 rounded-lg border border-[var(--b1)] bg-[var(--s0)] p-2"
          value={stageFilter}
          onChange={(event) => setStageFilter(event.target.value)}
        >
          {["All stages", ...stages].map((stage) => (
            <option key={stage}>{stage}</option>
          ))}
        </select>
        <Link
          href="/saved"
          className="inline-flex min-h-11 items-center text-[var(--blue)]"
        >
          Saved vehicles
        </Link>
      </div>
      {isLoading ? (
        <p role="status">Loading your checklist...</p>
      ) : error ? (
        <ErrorState
          title="Couldn't load your checklist"
          message="Sign in or retry to access your saved purchase tasks."
          onRetry={() => void mutate()}
        />
      ) : !saves.length ? (
        <div className="space-y-3 border-t border-[var(--b1)] py-6">
          <p className="text-[var(--t3)]">
            Save a vehicle to start planning its inspection and purchase.
          </p>
          <Link
            href="/discover"
            className="inline-flex min-h-11 items-center font-semibold text-[var(--blue)]"
          >
            Find a vehicle
          </Link>
        </div>
      ) : !visibleSaves.length ? (
        <div
          role="status"
          className="space-y-3 border-t border-[var(--b1)] py-6"
        >
          <p>No vehicles in {stageFilter.toLowerCase()}.</p>
          <button
            type="button"
            className="min-h-11 font-semibold text-[var(--blue)]"
            onClick={() => setStageFilter("All stages")}
          >
            Show all stages
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleSaves.map((save) => {
            const tags = save.tags || [];
            const completed = tasks.filter((_, index) =>
              tags.includes(`purchase-task:${index}`),
            ).length;
            const nextTask = tasks.find(
              (_, index) => !tags.includes(`purchase-task:${index}`),
            );
            const title =
              [save.snapshot?.year, save.snapshot?.make, save.snapshot?.model]
                .filter(Boolean)
                .join(" ") || "Saved vehicle";
            return (
              <section
                key={save.id}
                className="border border-[var(--b1)] rounded-lg bg-[var(--s0)] p-4 space-y-3"
              >
                <h2 className="font-bold">
                  {save.deal_id ? (
                    <Link
                      href={`/deal/${encodeURIComponent(save.deal_id)}`}
                      className="text-[var(--blue)]"
                    >
                      {title}
                    </Link>
                  ) : (
                    <span>{title}</span>
                  )}
                </h2>
                <p className="text-xs text-[var(--t3)]">
                  {completed} of {tasks.length} tasks recorded complete
                </p>
                {nextTask && (
                  <p className="text-sm font-medium">Next: {nextTask}</p>
                )}
                {save.status === "unavailable" ? (
                  <p className="text-[var(--amber)]">
                    Listing unavailable. Retained for your records.
                  </p>
                ) : (
                  <label className="flex gap-3 items-center">
                    Stage
                    <select
                      disabled={saving != null}
                      value={stageOf(save)}
                      className="min-h-11 bg-[var(--s1)] border border-[var(--b1)] rounded-lg p-2"
                      onChange={(event) => {
                        const stage = event.target.value;
                        void update(
                          save,
                          [
                            ...tags.filter(
                              (tag) => !tag.startsWith("purchase-stage:"),
                            ),
                            `purchase-stage:${stage}`,
                          ],
                          stage === "Purchased"
                            ? "acquired"
                            : save.status === "acquired"
                              ? "watching"
                              : save.status,
                        );
                      }}
                    >
                      {stages.map((stage) => (
                        <option key={stage}>{stage}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="space-y-3">
                  {tasks.map((task, index) => {
                    const tag = `purchase-task:${index}`;
                    return (
                      <label
                        key={task}
                        className="flex min-h-11 items-center gap-3"
                      >
                        <input
                          type="checkbox"
                          disabled={saving != null}
                          checked={tags.includes(tag)}
                          onChange={(event) =>
                            void update(
                              save,
                              event.target.checked
                                ? [...tags, tag]
                                : tags.filter((value) => value !== tag),
                            )
                          }
                        />
                        <span>{task}</span>
                      </label>
                    );
                  })}
                </div>
                <p role="status" className="text-xs text-[var(--t4)]">
                  {saving === save.id
                    ? "Saving..."
                    : "Checklist progress is your record; it does not verify vehicle condition."}
                </p>
                {writeError?.id === save.id && (
                  <div>
                    <p role="alert" className="text-sm text-[var(--red)]">
                      {writeError.message}
                    </p>
                    <button
                      disabled={saving != null}
                      onClick={() => void mutate()}
                      className="min-h-11 text-sm text-[var(--blue)]"
                    >
                      Reload plan
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-3 border-t border-[var(--b1)] pt-2">
                  <Link
                    href="/deal-check"
                    className="inline-flex min-h-11 items-center text-sm text-[var(--blue)]"
                  >
                    Review offer costs
                  </Link>
                  <Link
                    href="/move"
                    className="inline-flex min-h-11 items-center text-sm text-[var(--blue)]"
                  >
                    Transport estimate
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
