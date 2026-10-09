"use client";

import React, { useEffect, useRef, useState } from "react";
import { Ico } from "@/components/shared/Ico";
import { Mono } from "@/components/shared/Mono";
import { MikeHuntLoader } from "@/components/brand/MikeHuntLoader";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";
import { userFacingErrorMessage } from "@/lib/user-facing-error";

const money = (v: any) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(Number(v) || 0);

export default function DealCheckPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const fileReader = useRef<FileReader | null>(null);
  const lastPayload = useRef<{ image?: string; text?: string } | null>(null);
  const showLoader = useDelayedLoading(loading);

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
      if (id !== requestId.current) return;
      setError(
        "We couldn't open this photo. Choose another file and try again.",
      );
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
              ? "We couldn't identify a vehicle in this text. Include its year, make, model, price, and any known condition details."
              : json.error,
            "We couldn't analyze this listing. Please try again.",
          ),
        );
      else if (
        json.extracted &&
        typeof json.extracted === "object" &&
        !Array.isArray(json.extracted)
      )
        setResult(json);
      else
        setError(
          "We couldn't read vehicle details from this response. Your input is still here. Please try again.",
        );
    } catch (e: any) {
      if (e.name !== "AbortError" && id === requestId.current)
        setError(
          userFacingErrorMessage(
            e,
            "We couldn't analyze this listing. Please try again.",
          ),
        );
    } finally {
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

  return (
    <div
      className="max-w-2xl mx-auto px-4 py-8 space-y-6"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div>
        <h1 className="text-2xl font-black text-[var(--t1)] mb-1">
          Deal Check
        </h1>
        <p className="text-[var(--t3)]">
          Add a listing link, vehicle details, or a clear photo of an offer.
          Review the extracted information and any missing costs before
          deciding.
        </p>
      </div>

      <div className="glass-panel p-1 rounded-2xl border border-[var(--b2)]">
        <form onSubmit={handleTextSubmit} className="flex flex-col">
          <textarea
            aria-label="Listing link or vehicle details"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Paste a URL or raw text from a deal sheet..."
            className="w-full bg-transparent resize-y p-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] text-[var(--t2)] placeholder:text-[var(--t4)] min-h-[140px] rounded-lg"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--b2)] p-3">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex min-h-11 items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--s2)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)] text-[var(--t3)] text-sm font-semibold"
            >
              <Ico name="camera" size={18} />
              <span>Upload Photo</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              capture="environment"
              className="hidden"
              onChange={onFile}
            />
            <button
              type="submit"
              disabled={loading || !textInput.trim()}
              className="min-h-11 px-4 py-1.5 rounded-lg font-bold text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              style={{ background: "var(--blue)" }}
            >
              Analyze
            </button>
          </div>
        </form>
      </div>

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
          <p>{error}</p>
          {lastPayload.current && (
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
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--green)]">
            <MikeHuntLoader state="complete" size={28} label="Deal analysis" />
            Analysis ready
          </div>
          <p className="text-sm text-[var(--t3)]">
            Read from your document by AI. Verify these details against the
            original; this is not an inspection or a buy recommendation.
          </p>
          {/* Market comparison */}
          {mc && (
            <div className="glass-panel p-5">
              <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold mb-2">
                Asking-price context
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
                            {comp.mileage
                              ? `${comp.mileage.toLocaleString()} mi`
                              : "Mileage unlisted"}
                          </span>
                        </div>

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
                .join(" ") || "Extracted"}
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
                ⚠ Flags
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
