"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Ico } from "@/components/shared/Ico";
import { createClientComponentClient } from "@/lib/supabase";
import { parseSearchQuery } from "@/lib/nlp/parse-search";
import {
  readLocalSavedSearches,
  saveLocalSavedSearch,
  scanHrefForSavedSearch,
  sourceProofHrefForSavedSearch,
  toggleLocalSavedSearch,
  writeLocalSavedSearches,
} from "@/hooks/useLocalSavedSearches";

export default function SearchesPage() {
  const supabase = createClientComponentClient();
  const [searches, setSearches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
  const [formNotifySms, setFormNotifySms] = useState(false);
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
    if (p.target_profit) setFormTargetProfit(String(p.target_profit));
    if (p.require_go) setFormRequireGo(true);
    if (!formName) setFormName(nlQuery.slice(0, 50));
    setIsCreating(true);
  }

  useEffect(() => {
    fetchSearches();
  }, []);

  async function fetchSearches() {
    setLoading(true);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      setSearches(readLocalSavedSearches());
      return setLoading(false);
    }

    try {
      const { data } = await supabase
        .from("user_saved_searches")
        .select("*")
        .eq("user_id", user.user.id)
        .order("created_at", { ascending: false });

      const local = readLocalSavedSearches();
      if (data) setSearches([...local, ...data]);
    } catch (err) {
      console.warn("Table might not exist yet");
      setSearches(readLocalSavedSearches());
    }
    setLoading(false);
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
    setFormNotifySms(false);
  }

  async function handleSaveSearch(e: React.FormEvent) {
    e.preventDefault();
    const { data: user } = await supabase.auth.getUser();
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
      target_profit: formTargetProfit ? Number(formTargetProfit) : null,
      require_go: formRequireGo,
      notify_email: Boolean(user.user) && formNotifyEmail,
      notify_sms: false,
      is_active: true,
    };

    if (!user.user) {
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

    await supabase.from("user_saved_searches").insert({
      user_id: user.user.id,
      ...payload,
    });

    resetForm();
    fetchSearches();
  }

  async function handleDelete(id: string) {
    if (id.startsWith("local-")) {
      const list = readLocalSavedSearches().filter(
        (item: any) => item.id !== id,
      );
      writeLocalSavedSearches(list);
      setSearches((current) => current.filter((item) => item.id !== id));
      return;
    }
    await supabase.from("user_saved_searches").delete().eq("id", id);
    fetchSearches();
  }

  async function toggleActive(id: string, current: boolean) {
    if (id.startsWith("local-")) {
      toggleLocalSavedSearch(id, current);
      setSearches((items) =>
        items.map((item) =>
          item.id === id ? { ...item, is_active: !current } : item,
        ),
      );
      return;
    }
    await supabase
      .from("user_saved_searches")
      .update({ is_active: !current })
      .eq("id", id);
    fetchSearches();
  }

  const inputClass =
    "w-full bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] px-3 py-2 text-[var(--t1)]";

  return (
    <div
      className="max-w-4xl mx-auto px-4 py-8"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-[var(--t1)] mb-1">
            Saved Searches &amp; Alerts
          </h1>
          <p className="text-[var(--t3)]">
            We match every newly scraped deal against these. When one hits your
            criteria, it lands in your Alerts inbox — and emails/texts you if
            you opt in.
          </p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--r3)] font-bold text-white transition-all hover:scale-105 active:scale-95 shrink-0"
          style={{ background: "var(--amber)" }}
        >
          <Ico name={isCreating ? "x" : "plus"} size={16} />
          {isCreating ? "Cancel" : "New Alert"}
        </button>
      </div>

      {/* Natural-language search → fills the alert form */}
      <div className="glass-panel p-4 mb-6 flex gap-2">
        <input
          value={nlQuery}
          onChange={(e) => setNlQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyNl();
          }}
          placeholder="Describe it: “clean F-150s under 25k in Texas with good profit”"
          className="flex-1 bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] px-3 py-2 text-sm text-[var(--t1)]"
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
          <h2 className="text-lg font-bold text-[var(--t1)] mb-4">
            Create Alert
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="md:col-span-2">
              <label className="block text-sm text-[var(--t2)] mb-1">
                Alert Name
              </label>
              <input
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
              <input
                value={formState}
                onChange={(e) =>
                  setFormState(e.target.value.toUpperCase().slice(0, 2))
                }
                placeholder="e.g. FL"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--t2)] mb-1">
                Buying lane
              </label>
              <select
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
                type="number"
                value={formMaxYear}
                onChange={(e) => setFormMaxYear(e.target.value)}
                placeholder="e.g. 2022"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--t2)] mb-1">
                Max Ask Price ($)
              </label>
              <input
                type="number"
                value={formMaxPrice}
                onChange={(e) => setFormMaxPrice(e.target.value)}
                placeholder="e.g. 25000"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--t2)] mb-1">
                Min Net Profit ($)
              </label>
              <input
                type="number"
                value={formTargetProfit}
                onChange={(e) => setFormTargetProfit(e.target.value)}
                placeholder="e.g. 3000"
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 mb-6">
            <label className="flex items-center gap-2 text-sm text-[var(--t2)] cursor-pointer">
              <input
                type="checkbox"
                checked={formRequireGo}
                onChange={(e) => setFormRequireGo(e.target.checked)}
                className="accent-[var(--amber)]"
              />
              BUY deals only
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--t2)] cursor-pointer">
              <input
                type="checkbox"
                checked={formNotifyEmail}
                onChange={(e) => setFormNotifyEmail(e.target.checked)}
                className="accent-[var(--amber)]"
              />
              Email me
            </label>
            <label
              className="flex items-center gap-2 text-sm text-[var(--t4)] cursor-not-allowed"
              title="SMS alerts are coming soon"
            >
              <input
                type="checkbox"
                checked={false}
                disabled
                className="accent-[var(--amber)]"
              />
              Text me{" "}
              <span className="text-[10px] uppercase tracking-wide text-[var(--t5)]">
                soon
              </span>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-2 rounded-[var(--r3)] font-bold text-white bg-[var(--green)] hover:brightness-110"
            >
              Save Alert
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-[var(--t3)]">
          Loading your alerts...
        </div>
      ) : searches.length === 0 ? (
        <div className="text-center py-12 glass-panel">
          <Ico
            name="bell"
            size={32}
            className="mx-auto text-[var(--amber)] mb-3"
          />
          <h3 className="text-lg font-bold text-[var(--t1)] mb-1">
            No Alerts Yet
          </h3>
          <p className="text-[var(--t3)]">
            Create an alert and we&apos;ll notify you when a matching deal shows
            up.
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
                    <span>
                      Stored on this device. Sign in later to sync alerts.
                    </span>
                  ) : null}
                  {search.notify_email && <span>Email</span>}
                  {search.notify_sms && <span>✆ SMS</span>}
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
                  className="px-3 py-1.5 text-sm font-semibold rounded bg-[var(--s2)] text-[var(--t2)] hover:text-[var(--t1)] border border-[var(--b2)]"
                >
                  Open Scan
                </Link>
                <Link
                  href={sourceProofHrefForSavedSearch(search)}
                  className="px-3 py-1.5 text-sm font-semibold rounded bg-[var(--s2)] text-[var(--t2)] hover:text-[var(--t1)] border border-[var(--b2)]"
                >
                  Source proof
                </Link>
                <button
                  onClick={() => toggleActive(search.id, search.is_active)}
                  className="px-3 py-1.5 text-sm font-semibold rounded bg-[var(--s2)] text-[var(--t2)] hover:text-[var(--t1)] border border-[var(--b2)]"
                >
                  {search.is_active ? "Pause" : "Resume"}
                </button>
                <button
                  onClick={() => handleDelete(search.id)}
                  className="px-3 py-1.5 text-sm font-semibold rounded bg-[rgba(255,56,92,0.1)] text-[var(--red)] hover:bg-[var(--red)] hover:text-white transition-colors"
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
