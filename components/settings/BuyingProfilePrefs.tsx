"use client";

import { useEffect, useState } from "react";
import { usePreferences, type Prefs } from "@/hooks/usePreferences";
import { includesRepairable } from "@/lib/intelligence/repair-risk";
import {
  BUYER_MODES,
  VEHICLE_TO_QUERY,
  type BuyerMode,
} from "@/hooks/useBuyerIntent";

type Scope = NonNullable<Prefs["buyerScope"]>;
const field =
  "w-full min-w-0 min-h-11 rounded-lg border border-[var(--b2)] bg-[var(--s1)] px-3 py-2 text-sm text-[var(--t1)]";

export function BuyingProfilePrefs() {
  const { prefs, save, isLoading, authed, error } = usePreferences();
  const [draft, setDraft] = useState<Scope>({});
  const [makes, setMakes] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (isLoading) return;
    setDraft(prefs.buyerScope || {});
    setMakes(
      (prefs.buyerScope?.makes || prefs.buyerScope?.preferredMakes || []).join(
        ", ",
      ),
    );
  }, [prefs.buyerScope, isLoading]);

  async function submit() {
    const min = draft.minPrice ?? 0;
    const max = draft.maxPrice ?? 0;
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min < 0 ||
      max < 0 ||
      (max > 0 && max < min)
    ) {
      setFailed(true);
      setStatus("Enter a valid budget. Maximum must be at least the minimum.");
      return;
    }
    setBusy(true);
    setFailed(false);
    setStatus("Saving...");
    try {
      const selectedMakes = Array.from(
        new Set(
          makes
            .split(",")
            .map((make) => make.trim())
            .filter(Boolean),
        ),
      ).slice(0, 30);
      await save({
        buyerScope: {
          ...draft,
          makes: selectedMakes,
          preferredMakes: selectedMakes,
        },
      });
      setStatus(
        authed
          ? "Buying preferences saved to your account."
          : "Buying preferences saved on this device.",
      );
    } catch {
      setFailed(true);
      setStatus("Could not save. Your changes are still here. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mt-5 border-t border-[var(--b1)] pt-5"
      aria-labelledby="buying-preferences-title"
    >
      <h3
        id="buying-preferences-title"
        className="text-sm font-bold text-[var(--t1)]"
      >
        Buying preferences
      </h3>
      <fieldset
        disabled={busy || isLoading || Boolean(error)}
        className="mt-3 min-w-0 space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="min-w-0 text-sm text-[var(--t2)]">
            Buyer mode
            <select
              className={field}
              value={draft.buyerMode || "personal"}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  buyerMode: event.target.value as BuyerMode,
                })
              }
            >
              {Object.entries(BUYER_MODES).map(([value, mode]) => (
                <option key={value} value={value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-sm text-[var(--t2)]">
            Seller type
            <select
              className={field}
              value={draft.sellerType || "all"}
              onChange={(event) =>
                setDraft({ ...draft, sellerType: event.target.value })
              }
            >
              <option value="all">Any seller</option>
              <option value="dealer">Dealers</option>
              <option value="private">Private sellers</option>
              <option value="auction">Auctions</option>
            </select>
          </label>
          <label className="min-w-0 text-sm text-[var(--t2)]">
            Minimum price ($)
            <input
              className={field}
              type="number"
              min="0"
              inputMode="decimal"
              value={draft.minPrice || ""}
              onChange={(event) =>
                setDraft({ ...draft, minPrice: Number(event.target.value) })
              }
            />
          </label>
          <label className="min-w-0 text-sm text-[var(--t2)]">
            {draft.buyerMode === "parts"
              ? "Maximum donor price ($)"
              : "Maximum price ($)"}
            <input
              className={field}
              type="number"
              min="0"
              inputMode="decimal"
              value={draft.maxPrice || ""}
              onChange={(event) =>
                setDraft({ ...draft, maxPrice: Number(event.target.value) })
              }
            />
          </label>
          <label className="min-w-0 text-sm text-[var(--t2)]">
            Title status
            <select
              className={field}
              value={draft.titleType || "all"}
              onChange={(event) =>
                setDraft({ ...draft, titleType: event.target.value })
              }
            >
              <option value="all">Any title</option>
              <option value="clean">Clean title</option>
              <option value="salvage">Salvage title</option>
            </select>
          </label>
          <label className="min-w-0 text-sm text-[var(--t2)]">
            Buying timeline
            <select
              className={field}
              value={draft.timeline || "research"}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  timeline: event.target.value as Scope["timeline"],
                })
              }
            >
              <option value="now">Ready now</option>
              <option value="month">This month</option>
              <option value="research">Researching</option>
            </select>
          </label>
        </div>
        {draft.buyerMode === "diy" && (
          <label className="block text-sm text-[var(--t2)]">
            Repair experience
            <select
              className={field}
              value={draft.repairCapability || "none"}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  repairCapability: event.target
                    .value as Scope["repairCapability"],
                })
              }
            >
              <option value="none">Professional repair support needed</option>
              <option value="basic">Basic maintenance experience</option>
              <option value="advanced">Mechanical repair experience</option>
            </select>
          </label>
        )}
        <details>
          <summary className="min-h-11 cursor-pointer text-sm font-bold text-[var(--t2)]">
            Vehicle types
            {draft.vehicles?.length ? ` (${draft.vehicles.length})` : " (any)"}
          </summary>
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
            {Object.keys(VEHICLE_TO_QUERY)
              .filter((label) => label !== "All vehicle types")
              .map((label) => (
                <label
                  key={label}
                  className="flex min-h-11 items-center gap-2 text-sm text-[var(--t2)]"
                >
                  <input
                    type="checkbox"
                    checked={(
                      draft.vehicles || (draft.vehicle ? [draft.vehicle] : [])
                    ).includes(label)}
                    onChange={(event) => {
                      const current =
                        draft.vehicles ||
                        (draft.vehicle ? [draft.vehicle] : []);
                      const vehicles = event.target.checked
                        ? [...current, label]
                        : current.filter((item) => item !== label);
                      setDraft({
                        ...draft,
                        vehicles,
                        vehicle: vehicles[0] || "All vehicle types",
                      });
                    }}
                  />
                  {label}
                </label>
              ))}
          </div>
        </details>
        <label className="block text-sm text-[var(--t2)]">
          Preferred makes
          <input
            className={field}
            value={makes}
            maxLength={400}
            placeholder="Toyota, Ford, Honda"
            onChange={(event) => setMakes(event.target.value)}
          />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--t1)]">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={includesRepairable(draft)}
            onChange={(event) =>
              setDraft({ ...draft, includeRepairable: event.target.checked })
            }
          />
          Include vehicles with reported damage or repair needs
        </label>
        <p className="-mt-1 text-xs text-[var(--t4)]">
          On personal and DIY profiles this also shows the Salvage &amp;
          Rebuildable lane on Discover, for research only.
        </p>
        <button
          type="button"
          onClick={() => void submit()}
          className="min-h-11 rounded-lg border border-[var(--b2)] px-4 text-sm font-bold text-[var(--t1)]"
        >
          {busy ? "Saving..." : "Save buying preferences"}
        </button>
        <a
          href="/onboarding?edit=1"
          className="ml-3 inline-flex min-h-11 items-center text-sm text-[var(--t2)] underline"
        >
          Review full buying profile
        </a>
      </fieldset>
      <p
        role={failed ? "alert" : "status"}
        className="mt-2 min-h-5 text-sm text-[var(--t2)]"
      >
        {status}
      </p>
    </section>
  );
}
