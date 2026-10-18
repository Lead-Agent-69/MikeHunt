"use client";

import { useEffect, useState } from "react";
import { usePreferences, type Prefs } from "@/hooks/usePreferences";
import { includesRepairable } from "@/lib/intelligence/repair-risk";
import { VEHICLE_TO_QUERY } from "@/hooks/useBuyerIntent";
import { buyingWorkspaceScope } from "@/lib/buyer/workspace-scope";

type Scope = NonNullable<Prefs["buyerScope"]>;
const field =
  "w-full min-w-0 min-h-11 rounded-lg border border-[var(--b2)] bg-[var(--s1)] px-3 py-2 text-base text-[var(--t1)]";
const POPULAR_MAKES = [
  "Ford",
  "Chevrolet",
  "Toyota",
  "Honda",
  "Nissan",
  "Ram",
  "Jeep",
  "BMW",
];

function Choice<T extends string>({
  name,
  value,
  checked,
  label,
  onChange,
}: {
  name: string;
  value: T;
  checked: boolean;
  label: string;
  onChange: (value: T) => void;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors ${checked ? "border-[var(--blue)] bg-[var(--blue)]/10 text-[var(--t1)]" : "border-[var(--b1)] bg-[var(--s1)] text-[var(--t3)]"}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="accent-[var(--blue)]"
      />
      {label}
    </label>
  );
}

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
        buyerScope: buyingWorkspaceScope({
          ...draft,
          makes: selectedMakes,
          preferredMakes: selectedMakes,
        }),
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
      id="buying-preferences"
      className="scroll-mt-20"
      aria-labelledby="buying-preferences-title"
    >
      <h2
        id="buying-preferences-title"
        className="text-sm font-bold text-[var(--t1)]"
      >
        Buying preferences
      </h2>
      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--red)]">
          Could not load buying preferences. Refresh before making changes.
        </p>
      )}
      <fieldset
        disabled={busy || isLoading || Boolean(error)}
        className="mt-3 min-w-0 space-y-3"
      >
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
            Seller type
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["all", "Any seller"],
              ["dealer", "Dealers"],
              ["private", "Private"],
              ["auction", "Auctions"],
            ].map(([value, label]) => (
              <Choice
                key={value}
                name="seller-type"
                value={value}
                label={label}
                checked={(draft.sellerType || "all") === value}
                onChange={(sellerType) => setDraft({ ...draft, sellerType })}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            Maximum price ($)
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
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
              Title status
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["all", "Any"],
                ["clean", "Clean"],
                ["salvage", "Salvage"],
              ].map(([value, label]) => (
                <Choice
                  key={value}
                  name="title-status"
                  value={value}
                  label={label}
                  checked={(draft.titleType || "all") === value}
                  onChange={(titleType) => setDraft({ ...draft, titleType })}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
              Buying timeline
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["now", "Ready now"],
                ["month", "This month"],
                ["research", "Researching"],
              ].map(([value, label]) => (
                <Choice
                  key={value}
                  name="buying-timeline"
                  value={value as NonNullable<Scope["timeline"]>}
                  label={label}
                  checked={(draft.timeline || "research") === value}
                  onChange={(timeline) => setDraft({ ...draft, timeline })}
                />
              ))}
            </div>
          </div>
        </div>
        {includesRepairable(draft) && (
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
        <div>
          <div className="mb-2 flex items-end justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
              Vehicle types
            </p>
            <span className="text-[10px] text-[var(--t4)]">
              {draft.vehicles?.length
                ? `${draft.vehicles.length} selected`
                : "Any type"}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3">
            {Object.keys(VEHICLE_TO_QUERY)
              .filter((label) => label !== "All vehicle types")
              .map((label) => (
                <label
                  key={label}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                    (
                      draft.vehicles || (draft.vehicle ? [draft.vehicle] : [])
                    ).includes(label)
                      ? "border-[var(--blue)] bg-[var(--blue)]/10 text-[var(--t1)]"
                      : "border-[var(--b1)] bg-[var(--s1)] text-[var(--t2)]"
                  }`}
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
        </div>
        <label className="block text-sm text-[var(--t2)]">
          Other preferred makes
          <input
            className={field}
            value={makes}
            maxLength={400}
            placeholder="Toyota, Ford, Honda"
            onChange={(event) => setMakes(event.target.value)}
          />
        </label>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
            Quick make preferences
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {POPULAR_MAKES.map((make) => {
              const selected = makes
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
                .includes(make);
              return (
                <label
                  key={make}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${selected ? "border-[var(--blue)] bg-[var(--blue)]/10" : "border-[var(--b1)] bg-[var(--s1)]"}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => {
                      const current = makes
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean);
                      const next = event.target.checked
                        ? [...current, make]
                        : current.filter((item) => item !== make);
                      setMakes(Array.from(new Set(next)).join(", "));
                    }}
                  />
                  {make}
                </label>
              );
            })}
          </div>
        </div>
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
        <button
          type="button"
          onClick={() => void submit()}
          className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-[var(--on-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)] disabled:opacity-50"
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
