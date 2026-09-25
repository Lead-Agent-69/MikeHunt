"use client";

import React, { useState } from "react";
import { Ico } from "@/components/shared/Ico";
import { Mono } from "@/components/shared/Mono";

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

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setTextInput("");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      analyze({ image: dataUrl });
    };
    reader.readAsDataURL(file);
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!textInput.trim()) return;
    setError(null);
    setResult(null);
    setPreview(null);
    analyze({ text: textInput });
  }

  async function analyze(payload: { image?: string; text?: string }) {
    setLoading(true);
    try {
      const res = await fetch("/api/deal-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "Failed to read the document.");
      else setResult(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
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
          Photograph an auction run sheet or wholesaler offer — we extract every
          fee and compare it to the market.
        </p>
      </div>

      <div className="glass-panel p-1 rounded-2xl border border-[var(--b2)]">
        <form onSubmit={handleTextSubmit} className="flex flex-col relative">
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Paste a URL or raw text from a deal sheet..."
            className="w-full bg-transparent resize-none p-4 pb-14 outline-none text-[var(--t2)] placeholder:text-[var(--t4)] min-h-[120px] rounded-xl"
          />
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--s2)] transition-colors text-[var(--t3)] text-sm font-semibold">
              <Ico name="camera" size={18} />
              <span>Upload Photo</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onFile}
              />
            </label>
            <button
              type="submit"
              disabled={loading || !textInput.trim()}
              className="px-4 py-1.5 rounded-lg font-bold text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              style={{ background: "var(--t1)" }}
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
        <div className="text-center py-6 text-[var(--t3)]">
          Reading the document…
        </div>
      )}
      {error && (
        <div className="glass-panel p-4 text-center text-[var(--red)] text-sm">
          {error}
        </div>
      )}

      {x && (
        <div className="space-y-4">
          {/* Market comparison */}
          {mc && (
            <div className="glass-panel p-5">
              <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold mb-2">
                vs market
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <Mono
                    className="text-2xl font-black"
                    style={{
                      fontFamily: "var(--fm)",
                      color: mc.isFair ? "var(--green)" : "var(--red)",
                    }}
                  >
                    {mc.vsMarket > 0 ? "+" : ""}
                    {money(mc.vsMarket)}
                  </Mono>
                  <p className="text-xs text-[var(--t4)]">
                    {mc.isFair ? "at/below market" : "above market"} · avg{" "}
                    {money(mc.marketAvg)} ({mc.sampleSize} comps)
                  </p>
                </div>
              </div>

              {mc.comps && mc.comps.length > 0 && (
                <div className="mt-6 border-t border-[var(--b2)] pt-4">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold mb-3">
                    Live Market Comps
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
                            {comp.mileage ? `${comp.mileage.toLocaleString()} mi` : "Mileage unlisted"}
                          </span>
                        </div>
                        <Mono className="text-sm font-bold text-[var(--t2)]">
                          {money(comp.ask_price)}
                        </Mono>
                      </a>
                    ))}
                  </div>
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
    <div className="flex items-center justify-between">
      <span
        className={`text-sm ${bold ? "font-bold text-[var(--t1)]" : "text-[var(--t3)]"}`}
      >
        {label}
      </span>
      <Mono
        className={`text-sm ${bold ? "font-black text-[var(--t1)]" : "text-[var(--t2)]"}`}
        style={{ fontFamily: "var(--fm)" }}
      >
        {value}
      </Mono>
    </div>
  );
}
