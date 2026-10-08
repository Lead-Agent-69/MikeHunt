"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/shared/ErrorState";
import { userFacingErrorMessage } from "@/lib/user-facing-error";

type PurchaseSave = {
  id: string;
  deal_id: string;
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
  const { data, error, isLoading, mutate } = useSWR<PurchaseSave[]>(
    "/api/saved-cars?filter=all",
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error("We couldn't load your purchase checklist.");
      return response.json();
    },
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState("All stages");
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
    setSaving(save.id);
    try {
      const response = await fetch(
        `/api/saved-cars/${encodeURIComponent(save.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags, status }),
        },
      );
      if (!response.ok)
        throw new Error("Your changes could not be saved. Please try again.");
      await mutate();
    } catch (error) {
      toast.error(userFacingErrorMessage(error));
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
            return (
              <section
                key={save.id}
                className="border border-[var(--b1)] rounded-lg bg-[var(--s0)] p-4 space-y-3"
              >
                <h2 className="font-bold">
                  <Link
                    href={`/deal/${save.deal_id}`}
                    className="text-[var(--blue)]"
                  >
                    {[
                      save.snapshot?.year,
                      save.snapshot?.make,
                      save.snapshot?.model,
                    ]
                      .filter(Boolean)
                      .join(" ") || "Saved vehicle"}
                  </Link>
                </h2>
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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
