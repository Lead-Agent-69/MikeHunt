"use client";

import React, { useEffect, useRef, useState } from "react";
import { Ico } from "@/components/shared/Ico";
import { Mono } from "@/components/shared/Mono";
import { MikeHuntLoader } from "@/components/brand/MikeHuntLoader";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import Link from "next/link";
import { Calculator, FileText } from "lucide-react";
import { offerSchema, reviewOffer } from "@/lib/deal-check/offer-review";

const money = (v: any) =>
  v == null || !Number.isFinite(Number(v))
    ? "Not provided"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(Number(v));

export default function DealCheckPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"amounts" | "document">("amounts");
  const [amounts, setAmounts] = useState({
    price: "",
    fees: "",
    addons: "",
    taxes: "",
    total: "",
  });
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const fileReader = useRef<FileReader | null>(null);
  const lastPayload = useRef<{ image?: string; text?: string } | null>(null);
  const showLoader = useDelayedLoading(loading);
  const resultFocus = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!result) return;
    resultFocus.current?.focus({ preventScroll: true });
    resultFocus.current?.scrollIntoView?.({ block: "start" });
  }, [result]);

  useEffect(
    () => () => {
      requestId.current += 1;
      controller.current?.abort();
      fileReader.current?.abort();
    },
    [],
  );

  function beginRequest() {
    requestId.current += 1;
    controller.current?.abort();
    setLoading(false);
    fileReader.current?.abort();
    return requestId.current;
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const id = beginRequest();
    setLoading(false);
    lastPayload.current = null;
    if (
      !/^(image\/png|image\/jpeg|image\/webp)$/.test(file.type) ||
      file.size > 5_900_000
    ) {
      setError("Choose a PNG, JPEG or WebP photo under 6 MB.");
      lastPayload.current = null;
      return;
    }
    setError(null);
    setResult(null);
    setTextInput("");
    const reader = new FileReader();
    fileReader.current = reader;
    reader.onload = () => {
      if (id !== requestId.current) return;
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      analyze({ image: dataUrl }, id);
    };
    reader.onerror = () => {
      if (id === requestId.current)
        setError("The image could not be read. Choose another file.");
    };
    reader.readAsDataURL(file);
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!textInput.trim()) return;
    const id = beginRequest();
    setError(null);
    setResult(null);
    setPreview(null);
    analyze({ text: textInput }, id);
  }

  async function analyze(
    payload: { image?: string; text?: string },
    id = beginRequest(),
  ) {
    const abortController = new AbortController();
    controller.current = abortController;
    lastPayload.current = payload;
    setLoading(true);
    const timer = setTimeout(() => abortController.abort(), 55000);
    try {
      const res = await fetch("/api/deal-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });
      const json = await res.json().catch(() => null);
      if (id !== requestId.current) return;
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        setError(
          "The analysis service didn't return a usable response. Your details are still here. Please try again.",
        );
        return;
      }
      if (!res.ok)
        setError(
          userFacingErrorMessage(
            payload.text &&
              /read the document|clearer photo/i.test(String(json.error || ""))
              ? "We couldn't read the offer amounts in this text. Include the selling price, itemized fees, taxes and quoted total, or enter the amounts directly."
              : json.error,
            "We couldn't analyze this listing. Please try again.",
          ),
        );
      else setResult({ ...json, extracted: offerSchema.parse(json.extracted) });
    } catch (e: any) {
      if (id === requestId.current)
        setError(
          userFacingErrorMessage(
            e.name === "AbortError"
              ? "Offer reading timed out. Retry or enter the amounts directly."
              : e,
            "We couldn't analyze this listing. Please try again.",
          ),
        );
    } finally {
      clearTimeout(timer);
      if (id === requestId.current) setLoading(false);
    }
  }

  function retry() {
    if (!lastPayload.current) return;
    const id = beginRequest();
    setError(null);
    analyze(lastPayload.current, id);
  }

  const x = result?.extracted;
  const mc = result?.marketComparison;
  const review = x ? reviewOffer(x) : null;

  function reviewAmounts(event: React.FormEvent) {
    event.preventDefault();
    beginRequest();
    setError(null);
    const value = (key: keyof typeof amounts) =>
      amounts[key].trim() === "" ? null : Number(amounts[key]);
    const parsed = offerSchema.safeParse({
      selling_price: value("price"),
      fees:
        value("fees") == null
          ? []
          : [{ name: "Fees entered", amount: value("fees") }],
      addons:
        value("addons") == null
          ? []
          : [{ name: "Add-ons entered", amount: value("addons") }],
      taxes: value("taxes"),
      total_out_the_door: value("total"),
    });
    if (!parsed.success || value("price") == null) {
      setError(
        "Enter a non-negative selling price and valid amounts for the costs you know.",
      );
      return;
    }
    setResult({ extracted: parsed.data, manual: true });
  }

  return (
    <div
      className="max-w-2xl mx-auto px-4 pt-5 pb-28 space-y-5"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div>
        <h1 className="text-2xl font-black text-[var(--t1)] mb-1">
          Deal Check
        </h1>
        <p className="text-[var(--t3)]">
          Offer price, itemized fees, taxes and quoted total. A cost review is
          not a vehicle inspection or a market-value appraisal.
        </p>
      </div>

      <div
        role="group"
        aria-label="Offer input"
        className="flex flex-wrap gap-2"
      >
        {[
          { mode: "amounts", label: "Enter amounts", icon: Calculator },
          { mode: "document", label: "Read offer", icon: FileText },
        ].map((item) => (
          <button
            key={item.mode}
            type="button"
            aria-pressed={mode === item.mode}
            onClick={() => {
              beginRequest();
              setMode(item.mode as "amounts" | "document");
              setResult(null);
              setError(null);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--b2)] px-3 text-sm aria-pressed:bg-[var(--s2)] aria-pressed:font-semibold"
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </div>
      {mode === "amounts" ? (
        <form
          onSubmit={reviewAmounts}
          className="space-y-4 border-y border-[var(--b1)] py-4"
        >
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "price", label: "Selling price ($)" },
              { key: "fees", label: "Itemized fees total ($)" },
              { key: "addons", label: "Add-ons total ($)" },
              { key: "taxes", label: "Taxes ($)" },
              { key: "total", label: "Quoted out-the-door total ($)" },
            ].map((field) => (
              <label
                key={field.key}
                className={`text-sm min-w-0 ${field.key === "total" ? "col-span-2" : ""}`}
              >
                <span className="block min-h-10">{field.label}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required={field.key === "price"}
                  value={amounts[field.key as keyof typeof amounts]}
                  onChange={(event) => {
                    setResult(null);
                    setError(null);
                    setAmounts((previous) => ({
                      ...previous,
                      [field.key]: event.target.value,
                    }));
                  }}
                  className="mt-1 min-h-11 w-full rounded-lg border border-[var(--b2)] bg-[var(--s0)] px-3"
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-[var(--t3)]">
            Blank amounts are unknown, not zero. Enter 0 only for a confirmed
            zero cost.
          </p>
          <button className="min-h-11 rounded-lg bg-[var(--t1)] px-4 text-sm font-semibold text-[var(--s0)]">
            Review amounts
          </button>
        </form>
      ) : (
        <div className="rounded-lg border border-[var(--b2)] bg-[var(--s0)] p-1">
          <form onSubmit={handleTextSubmit} className="flex flex-col relative">
            <textarea
              aria-label="Offer text or listing URL"
              value={textInput}
              onChange={(e) => {
                beginRequest();
                setTextInput(e.target.value);
                setResult(null);
                setError(null);
              }}
              placeholder="Paste a URL or raw text from a deal sheet..."
              className="w-full bg-transparent resize-none p-4 pb-14 outline-none text-[var(--t2)] placeholder:text-[var(--t4)] min-h-[120px] rounded-xl"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
              <label className="flex min-h-11 items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--s2)] focus-within:ring-2 focus-within:ring-[var(--accent)] transition-colors text-[var(--t3)] text-sm font-semibold">
                <Ico name="camera" size={18} />
                <span>Upload Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Upload offer photo"
                  className="sr-only"
                  onChange={onFile}
                />
              </label>
              <button
                type="submit"
                disabled={loading || !textInput.trim()}
                className="min-h-11 px-4 py-1.5 rounded-lg font-bold text-sm text-[var(--s0)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                style={{ background: "var(--t1)" }}
              >
                Read offer
              </button>
            </div>
          </form>
        </div>
      )}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="deal sheet"
          className="rounded-[var(--r2)] max-h-48 mx-auto"
        />
      )}

      {loading && (
        <div className="flex flex-col items-center gap-3 py-6 text-center text-[var(--t3)]">
          {showLoader && (
            <MikeHuntLoader
              state="loading"
              size={64}
              label="Analyzing deal details"
            />
          )}
          <span>Reading the document and checking market evidence…</span>
        </div>
      )}
      {error && (
        <div className="glass-panel flex flex-col items-center gap-3 p-4 text-center text-[var(--red)] text-sm">
          <MikeHuntLoader state="error" size={40} label="Deal check" />
          <p role="alert">{error}</p>
          {mode === "document" && lastPayload.current && (
            <button
              type="button"
              onClick={retry}
              className="min-h-11 rounded-lg border border-[var(--rbd)] px-3 py-1.5 font-bold text-[var(--red)]"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {x && (
        <div className="space-y-4">
          <div
            ref={resultFocus}
            tabIndex={-1}
            role="status"
            className="scroll-mt-28 flex items-center gap-2 text-sm font-bold text-[var(--green)]"
          >
            <MikeHuntLoader state="complete" size={28} label="Deal analysis" />
            {result.manual
              ? "Entered amounts reviewed"
              : "Extracted amounts: verify against the offer"}
          </div>
          {review && (
            <section
              aria-label="Offer arithmetic"
              className="border-y border-[var(--b1)] py-4 space-y-2"
            >
              <h2 className="text-base font-semibold">Cost check</h2>
              <Row
                label="Sum of provided amounts"
                value={money(review.sum)}
                bold
              />
              <p className="text-sm">
                {review.incomplete
                  ? "Incomplete: selling price or taxes not provided."
                  : review.difference == null
                    ? "No quoted total provided to reconcile."
                    : review.difference === 0
                      ? "Quoted total matches the provided amounts."
                      : `Quoted total differs from provided amounts by ${money(review.difference)}.`}
              </p>
              <p className="text-xs text-[var(--t3)]">
                Unreported fees, add-ons, repairs, transport and ongoing
                ownership costs are not verified by this sum.
              </p>
            </section>
          )}
          <p className="text-sm text-[var(--t3)]">
            Read from your document by AI. Verify these details against the
            original; this is not an inspection or a buy recommendation.
          </p>
          {/* Market comparison */}
          {mc && (
            <div className="glass-panel p-5">
              <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold mb-2">
                Asking-price context, not an appraisal
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <Mono
                    className="text-2xl font-black"
                    style={{
                      fontFamily: "var(--fm)",
                      color: "var(--t1)",
                    }}
                  >
                    {mc.vsMarket > 0 ? "+" : ""}
                    {money(mc.vsMarket)}
                  </Mono>
                  <p className="text-xs text-[var(--t4)]">
                    Difference from {money(mc.marketAvg)} average across{" "}
                    {mc.sampleSize} active asking prices.
                  </p>
                </div>
              </div>

              {mc.comps && mc.comps.length > 0 && (
                <div className="mt-6 border-t border-[var(--b2)] pt-4">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold mb-3">
                    Other active listings, not verified sold comparisons
                  </p>
                  <div className="space-y-2">
                    {mc.comps.map((comp: any) => (
                      <a
                        key={comp.id}
                        href={`/deal/${comp.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-3 rounded-lg border border-[var(--b2)] bg-[var(--s0)] hover:border-[var(--amber)] transition-colors group"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-[var(--t1)] group-hover:text-[var(--amber)] transition-colors">
                            {comp.year} {comp.make} {comp.model}
                          </span>
                          <span className="text-xs text-[var(--t4)]">
                            {comp.mileage != null
                              ? `${comp.mileage.toLocaleString()} mi`
                              : "Mileage unlisted"}
                          </span>
                        </div>
                        <p className="mt-3 text-xs text-[var(--t3)]">
                          This sample is not matched for title, condition,
                          mileage or location and does not establish a fair
                          purchase price. These are asking prices, not verified
                          sale outcomes.
                        </p>
                        <Mono className="text-sm font-bold text-[var(--t2)]">
                          {money(comp.ask_price)}
                        </Mono>
                      </a>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-[var(--t3)]">
                    Title, damage, fees, and condition may differ. These
                    listings cannot establish a fair purchase price or a buy
                    recommendation.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Extracted line items */}
          <div className="glass-panel p-5 space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold">
              {[x.vehicle?.year, x.vehicle?.make, x.vehicle?.model]
                .filter(Boolean)
                .join(" ") ||
                (result.manual
                  ? "Entered offer amounts"
                  : "Extracted offer amounts")}
            </p>
            <Row label="Selling price" value={money(x.selling_price)} bold />
            {(x.fees || []).map((f: any, i: number) => (
              <Row key={`f${i}`} label={f.name} value={money(f.amount)} />
            ))}
            {(x.addons || []).map((a: any, i: number) => (
              <Row
                key={`a${i}`}
                label={`${a.name} (add-on)`}
                value={money(a.amount)}
              />
            ))}
            {x.taxes != null && <Row label="Taxes" value={money(x.taxes)} />}
            {x.total_out_the_door != null && (
              <Row
                label="Out the door"
                value={money(x.total_out_the_door)}
                bold
              />
            )}
          </div>

          {/* Red flags */}
          {x.red_flags?.length > 0 && (
            <div className="glass-panel p-5">
              <p className="text-[10px] uppercase tracking-widest text-[var(--red)] font-bold mb-2">
                AI observations: unverified
              </p>
              <ul className="space-y-1">
                {x.red_flags.map((r: string, i: number) => (
                  <li key={i} className="text-sm text-[var(--t2)]">
                    • {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <nav
            aria-label="Next steps"
            className="flex flex-wrap gap-3 border-t border-[var(--b1)] pt-4"
          >
            <Link
              href="/saved"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--blue)]"
            >
              Saved vehicles
            </Link>
            <Link
              href="/fleet"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--blue)]"
            >
              Plan next steps
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span
        className={`min-w-0 break-words text-sm ${bold ? "font-bold text-[var(--t1)]" : "text-[var(--t3)]"}`}
      >
        {label}
      </span>
      <Mono
        className={`shrink-0 text-sm ${bold ? "font-black text-[var(--t1)]" : "text-[var(--t2)]"}`}
        style={{ fontFamily: "var(--fm)" }}
      >
        {value}
      </Mono>
    </div>
  );
}
