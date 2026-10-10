"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Ico } from "@/components/shared/Ico";
import { createClientComponentClient } from "@/lib/supabase";
import { parseSearchQuery } from "@/lib/nlp/parse-search";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { US_STATES } from "@/lib/utils/titleRules";
import {
  readLocalSavedSearches,
  saveLocalSavedSearch,
  scanHrefForSavedSearch,
  sourceProofHrefForSavedSearch,
  toggleLocalSavedSearch,
  writeLocalSavedSearches,
} from "@/hooks/useLocalSavedSearches";
import { LoadingState } from "@/components/shared/PageStates";

export default function SearchesPage() {
  const supabase = createClientComponentClient();
  const [searches, setSearches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hasAccount, setHasAccount] = useState(false);
  const { intent } = useBuyerIntent();
  const flipDesk =
    intent?.buyerMode === "dealer" || intent?.buyerMode === "reseller";

  // Form State
  const [isCreating, setIsCreating] = useState(false);
  const [formName, setFormName] = useState("");
  const [formMake, setFormMake] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formState, setFormState] = useState("");
  const [formLane, setFormLane] = useState("all");
  const [formSellerType, setFormSellerType] = useState("all");
  const [formTitleType, setFormTitleType] = useState("all");
  const [formMinYear, setFormMinYear] = useState("");
  const [formMaxYear, setFormMaxYear] = useState("");
  const [formMaxPrice, setFormMaxPrice] = useState("");
  const [formTargetProfit, setFormTargetProfit] = useState("");
  const [formRequireGo, setFormRequireGo] = useState(false);
  const [formNotifyEmail, setFormNotifyEmail] = useState(true);
  const [nlQuery, setNlQuery] = useState("");

  // Parse a plain-English query into the form fields.
  function applyNl() {
    const p = parseSearchQuery(nlQuery);
    if (p.make) setFormMake(p.make);
    if (p.model) setFormModel(p.model);
    if ((p as any).state) setFormState((p as any).state);
    if (p.min_year) setFormMinYear(String(p.min_year));
    if (p.max_year) setFormMaxYear(String(p.max_year));
    if (p.max_price) setFormMaxPrice(String(p.max_price));
    if (flipDesk && p.target_profit)
      setFormTargetProfit(String(p.target_profit));
    if (flipDesk && p.require_go) setFormRequireGo(true);
    if (!formName) setFormName(nlQuery.slice(0, 50));
    setIsCreating(true);
  }

  useEffect(() => {
    fetchSearches();
  }, []);

  async function fetchSearches() {
    setLoading(true);
    setLoadError(null);
    try {
      const user = await currentUser();
      setHasAccount(Boolean(user));
      if (!user) {
        setSearches(readLocalSavedSearches());
        return;
      }
      const { data, error } = await supabase
        .from("user_saved_searches")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const local = readLocalSavedSearches();
      setSearches([...local, ...(data || [])]);
    } catch {
      setLoadError(
        "Saved searches could not be loaded. Retry to check your account.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function currentUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") throw error;
    return data.user;
  }

  function resetForm() {
    setIsCreating(false);
    setFormName("");
    setFormMake("");
    setFormModel("");
    setFormState("");
    setFormLane("all");
    setFormSellerType("all");
    setFormTitleType("all");
    setFormMinYear("");
    setFormMaxYear("");
    setFormMaxPrice("");
    setFormTargetProfit("");
    setFormRequireGo(false);
    setFormNotifyEmail(true);
  }

  async function handleSaveSearch(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setActionError(null);
    if (
      formMinYear &&
      formMaxYear &&
      Number(formMinYear) > Number(formMaxYear)
    ) {
      setActionError("Minimum year must not exceed maximum year.");
      return;
    }
    setBusy("save");
    try {
      const user = await currentUser();
      const payload = {
        name: formName || `${formMake} ${formModel}`.trim() || "My search",
        make: formMake || null,
        model: formModel || null,
        state: formState || null,
        lane: formLane !== "all" ? formLane : null,
        seller_type: formSellerType !== "all" ? formSellerType : null,
        title_type: formTitleType !== "all" ? formTitleType : null,
        min_year: formMinYear ? Number(formMinYear) : null,
        max_year: formMaxYear ? Number(formMaxYear) : null,
        max_price: formMaxPrice ? Number(formMaxPrice) : null,
        target_profit:
          flipDesk && formTargetProfit ? Number(formTargetProfit) : null,
        require_go: flipDesk && formRequireGo,
        notify_email: Boolean(user) && formNotifyEmail,
        notify_sms: false,
        is_active: true,
      };

      if (!user) {
        const localSearch = saveLocalSavedSearch(payload);
        setSearches([
          localSearch,
          ...readLocalSavedSearches().filter(
            (item) => item.id !== localSearch.id,
          ),
        ]);
        resetForm();
        return;
      }

      const { data, error } = await supabase
        .from("user_saved_searches")
        .insert({
          user_id: user.id,
          ...payload,
        })
        .select("id")
        .single();
      if (error || !data?.id) throw error || new Error("Unconfirmed save");

      resetForm();
      await fetchSearches();
    } catch {
      setActionError(
        "Search was not confirmed saved. Your entries are preserved; retry or check your account.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(id: string) {
    if (
      busy ||
      !window.confirm("Delete this saved search? This cannot be undone.")
    )
      return;
    setBusy(id);
    setActionError(null);
    try {
      if (id.startsWith("local-")) {
        const list = readLocalSavedSearches().filter(
          (item: any) => item.id !== id,
        );
        writeLocalSavedSearches(list);
        setSearches((current) => current.filter((item) => item.id !== id));
        return;
      }
      const user = await currentUser();
      if (!user) throw new Error("Sign-in required");
      const { data, error } = await supabase
        .from("user_saved_searches")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id");
      if (error || data?.length !== 1)
        throw error || new Error("Unconfirmed deletion");
      await fetchSearches();
    } catch {
      setActionError(
        "Deletion was not confirmed. Retry or reload before trying again.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    if (busy) return;
    setBusy(id);
    setActionError(null);
    try {
      if (id.startsWith("local-")) {
        toggleLocalSavedSearch(id, current);
        setSearches((items) =>
          items.map((item) =>
            item.id === id ? { ...item, is_active: !current } : item,
          ),
        );
        return;
      }
      const user = await currentUser();
      if (!user) throw new Error("Sign-in required");
      const { data, error } = await supabase
        .from("user_saved_searches")
        .update({ is_active: !current })
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id")
        .single();
      if (error || !data?.id) throw error || new Error("Unconfirmed update");
      await fetchSearches();
    } catch {
      setActionError(
        "Search status was not confirmed changed. Retry or reload.",
      );
    } finally {
      setBusy(null);
    }
  }

  const inputClass =
    "w-full min-h-11 bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] px-3 py-2 text-[var(--t1)]";

  return (
    <div
      className="max-w-4xl mx-auto px-4 py-8"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-2xl font-black text-[var(--t1)] mb-1">
            Saved searches
          </h1>
          <p className="text-[var(--t3)]">
            Account searches can receive matching-listing alerts. Device-only
            searches do not send notifications. SMS is unavailable.
          </p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          disabled={Boolean(busy)}
          className="flex min-h-11 items-center gap-2 px-4 py-2 rounded-lg font-bold text-[var(--on-accent)] transition-all shrink-0"
          style={{ background: "var(--amber)" }}
        >
          <Ico name={isCreating ? "x" : "plus"} size={16} />
          {isCreating ? "Cancel" : "New search"}
        </button>
      </div>

      {actionError && (
        <p role="alert" className="mb-4 text-sm text-[var(--red)]">
          {actionError}
        </p>
      )}
      {loadError && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 text-sm text-[var(--red)]"
        >
          <p>{loadError}</p>
          <button
            type="button"
            disabled={loading || Boolean(busy)}
            onClick={() => void fetchSearches()}
            className="min-h-11 px-3 border border-[var(--b2)]"
          >
            Retry
          </button>
        </div>
      )}

      {/* Natural-language search → fills the alert form */}
      <div className="glass-panel p-4 mb-6 flex gap-2">
        <input
          aria-label="Describe your saved search"
          value={nlQuery}
          onChange={(e) => setNlQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyNl();
          }}
          placeholder={
            flipDesk
              ? "Clean F-150s under 25k in Texas with good profit"
              : "Clean F-150s under 25k in Texas"
          }
          className="min-w-0 flex-1 min-h-11 bg-[var(--s0)] border border-[var(--b2)] rounded-lg px-3 py-2 text-sm text-[var(--t1)]"
        />
        <button
          onClick={applyNl}
          className="px-4 py-2 rounded-[var(--r3)] font-bold text-sm text-white shrink-0"
          style={{ background: "var(--grad)" }}
        >
          Parse
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleSaveSearch} className="glass-panel p-6 mb-8">
          <fieldset disabled={Boolean(busy)} className="min-w-0">
            <h2 className="text-lg font-bold text-[var(--t1)] mb-4">
              Create saved search
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div className="md:col-span-2">
                <label className="block text-sm text-[var(--t2)] mb-1">
                  Search name
                </label>
                <input
                  aria-label="Search name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. F-150s under $25k"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--t2)] mb-1">
                  Make
                </label>
                <input
                  aria-label="Make"
                  value={formMake}
                  onChange={(e) => setFormMake(e.target.value)}
                  placeholder="e.g. Ford"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--t2)] mb-1">
                  Model
                </label>
                <input
                  aria-label="Model"
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value)}
                  placeholder="e.g. F-150"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--t2)] mb-1">
                  State / market
                </label>
                <select
                  aria-label="State / market"
                  value={formState}
                  onChange={(e) => setFormState(e.target.value)}
                  className={inputClass}
                >
                  <option value="">All states</option>
                  {US_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-[var(--t2)] mb-1">
                  Buying lane
                </label>
                <select
                  aria-label="Buying lane"
                  value={formLane}
                  onChange={(e) => setFormLane(e.target.value)}
                  className={inputClass}
                >
                  <option value="all">All lanes</option>
                  <option value="damaged">Salvage & repairable</option>
                  <option value="auction">Wholesale auctions</option>
                  <option value="government">Government / repo</option>
                  <option value="clean-retail">Clean retail</option>
                  <option value="private">Private / dealer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[var(--t2)] mb-1">
                  Seller type
                </label>
                <select
                  aria-label="Seller type"
                  value={formSellerType}
                  onChange={(e) => setFormSellerType(e.target.value)}
                  className={inputClass}
                >
                  <option value="all">Any seller</option>
                  <option value="dealer">Dealer</option>
                  <option value="auction">Auction</option>
                  <option value="private">Private</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[var(--t2)] mb-1">
                  Title type
                </label>
                <select
                  aria-label="Title type"
                  value={formTitleType}
                  onChange={(e) => setFormTitleType(e.target.value)}
                  className={inputClass}
                >
                  <option value="all">Any title</option>
                  <option value="clean">Clean</option>
                  <option value="salvage">Salvage</option>
                  <option value="rebuilt">Rebuilt</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[var(--t2)] mb-1">
                  Min Year
                </label>
                <input
                  aria-label="Min Year"
                  min="1886"
                  max={new Date().getFullYear() + 2}
                  step="1"
                  type="number"
                  value={formMinYear}
                  onChange={(e) => setFormMinYear(e.target.value)}
                  placeholder="e.g. 2015"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--t2)] mb-1">
                  Max Year
                </label>
                <input
                  aria-label="Max Year"
                  min="1886"
                  max={new Date().getFullYear() + 2}
                  step="1"
                  type="number"
                  value={formMaxYear}
                  onChange={(e) => setFormMaxYear(e.target.value)}
                  placeholder="e.g. 2022"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--t2)] mb-1">
                  Max reported price ($)
                </label>
                <input
                  aria-label="Max reported price ($)"
                  min="0"
                  step="1"
                  type="number"
                  value={formMaxPrice}
                  onChange={(e) => setFormMaxPrice(e.target.value)}
                  placeholder="e.g. 25000"
                  className={inputClass}
                />
              </div>
              {flipDesk && (
                <div>
                  <label className="block text-sm text-[var(--t2)] mb-1">
                    Min Net Profit ($)
                  </label>
                  <input
                    aria-label="Min Net Profit ($)"
                    min="0"
                    step="1"
                    type="number"
                    value={formTargetProfit}
                    onChange={(e) => setFormTargetProfit(e.target.value)}
                    placeholder="e.g. 3000"
                    className={inputClass}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 mb-6">
              {flipDesk && (
                <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--t2)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formRequireGo}
                    onChange={(e) => setFormRequireGo(e.target.checked)}
                    className="accent-[var(--amber)]"
                  />
                  BUY deals only
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-[var(--t2)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasAccount && formNotifyEmail}
                  disabled={!hasAccount}
                  onChange={(e) => setFormNotifyEmail(e.target.checked)}
                  className="accent-[var(--amber)]"
                />
                {hasAccount ? "Email me" : "Email requires sign-in"}
              </label>
              <label
                className="flex items-center gap-2 text-sm text-[var(--t4)] cursor-not-allowed"
                title="SMS alerts are unavailable"
              >
                <input
                  type="checkbox"
                  checked={false}
                  disabled
                  className="accent-[var(--amber)]"
                />
                Text me{" "}
                <span className="text-[10px] uppercase tracking-wide text-[var(--t5)]">
                  unavailable
                </span>
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={Boolean(busy)}
                className="min-h-11 px-6 py-2 rounded-lg font-bold text-white bg-[var(--green)] hover:brightness-110 disabled:opacity-50"
              >
                {busy === "save" ? "Saving..." : "Save search"}
              </button>
            </div>
          </fieldset>
        </form>
      )}

      {loading ? (
        <LoadingState label="Loading your alerts…" />
      ) : searches.length === 0 && !loadError ? (
        <div className="text-center py-12 glass-panel">
          <Ico
            name="bell"
            size={32}
            className="mx-auto text-[var(--amber)] mb-3"
          />
          <h3 className="text-lg font-bold text-[var(--t1)] mb-1">
            No saved searches
          </h3>
          <p className="text-[var(--t3)]">
            No searches saved to this account or device.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {searches.map((search) => (
            <div
              key={search.id}
              className="glass-panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`w-2 h-2 rounded-full ${search.is_active ? "bg-[var(--green)] shadow-[0_0_8px_var(--green)]" : "bg-[var(--t4)]"}`}
                  />
                  <h3 className="font-bold text-[var(--t1)]">{search.name}</h3>
                  {search.require_go && (
                    <span
                      className="px-1.5 py-0.5 text-[10px] font-bold rounded"
                      style={{
                        background: "var(--glo)",
                        color: "var(--green)",
                      }}
                    >
                      BUY only
                    </span>
                  )}
                  {search.local && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded border border-[var(--b2)] text-[var(--t4)]">
                      local
                    </span>
                  )}
                </div>
                <div className="text-sm text-[var(--t3)] flex flex-wrap items-center gap-x-3 gap-y-1">
                  {search.make && <span>Make: {search.make}</span>}
                  {search.makes?.length ? (
                    <span>Makes: {search.makes.join(", ")}</span>
                  ) : null}
                  {search.model && <span>Model: {search.model}</span>}
                  {search.q && <span>Search: {search.q}</span>}
                  {search.state && <span>State: {search.state}</span>}
                  {search.lane && (
                    <span>Lane: {String(search.lane).replace(/-/g, " ")}</span>
                  )}
                  {search.seller_type && (
                    <span>Seller: {search.seller_type}</span>
                  )}
                  {search.title_type && <span>Title: {search.title_type}</span>}
                  {search.dealer_source_ids?.length ? (
                    <span>Dealers: {search.dealer_source_ids.join(", ")}</span>
                  ) : null}
                  {(search.min_year || search.max_year) && (
                    <span>
                      Year: {search.min_year || "…"}–{search.max_year || "…"}
                    </span>
                  )}
                  {search.max_price && (
                    <span>
                      Max: ${Number(search.max_price).toLocaleString()}
                    </span>
                  )}
                  {search.min_price && (
                    <span>
                      Min: ${Number(search.min_price).toLocaleString()}
                    </span>
                  )}
                  {search.target_profit && (
                    <span>
                      Min profit: $
                      {Number(search.target_profit).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--t4)] mt-1.5 flex items-center gap-2">
                  {search.local ? (
                    <span>Device only. No automatic alerts.</span>
                  ) : null}
                  {!search.local && search.notify_email && (
                    <span>Email requested</span>
                  )}
                  {search.last_run_at && (
                    <span>
                      · Last match{" "}
                      {new Date(search.last_run_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link
                  href={scanHrefForSavedSearch(search)}
                  className="inline-flex min-h-11 items-center px-3 py-1.5 text-sm font-semibold rounded bg-[var(--s2)] text-[var(--t2)] hover:text-[var(--t1)] border border-[var(--b2)]"
                >
                  Open Scan
                </Link>
                <Link
                  href={sourceProofHrefForSavedSearch(search)}
                  className="inline-flex min-h-11 items-center px-3 py-1.5 text-sm font-semibold rounded bg-[var(--s2)] text-[var(--t2)] hover:text-[var(--t1)] border border-[var(--b2)]"
                >
                  Source proof
                </Link>
                <button
                  disabled={Boolean(busy)}
                  onClick={() => toggleActive(search.id, search.is_active)}
                  className="inline-flex min-h-11 items-center px-3 py-1.5 text-sm font-semibold rounded bg-[var(--s2)] text-[var(--t2)] hover:text-[var(--t1)] border border-[var(--b2)]"
                >
                  {search.is_active ? "Pause" : "Resume"}
                </button>
                <button
                  disabled={Boolean(busy)}
                  onClick={() => handleDelete(search.id)}
                  className="inline-flex min-h-11 items-center px-3 py-1.5 text-sm font-semibold rounded bg-[rgba(255,56,92,0.1)] text-[var(--red)] hover:bg-[var(--red)] hover:text-white transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
