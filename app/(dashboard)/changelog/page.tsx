"use client";

import React, { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";

export default function ChangelogPage() {
  const supabase = createClientComponentClient();
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("changelog")
      .select("*")
      .order("published_at", { ascending: false })
      .then(({ data }) => setEntries(data || []));
  }, []);

  return (
    <div
      className="max-w-2xl mx-auto px-4 py-12"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <h1 className="text-3xl font-black text-[var(--t1)] mb-1">Changelog</h1>
      <p className="text-[var(--t3)] mb-10">Every update to DealerHunt Pro.</p>

      {entries.length === 0 && (
        <div className="glass-panel p-8 text-center text-[var(--t4)] text-sm">
          No updates published yet.
        </div>
      )}

      <div className="space-y-10">
        {entries.map((e) => (
          <div key={e.id} className="border-l-2 border-[var(--b2)] pl-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-[var(--t4)] font-mono">
                {e.published_at
                  ? new Date(e.published_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : ""}
              </span>
              {e.is_major && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--amber-lo)",
                    color: "var(--amber-d)",
                  }}
                >
                  major
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-[var(--t1)] mb-1">
              {e.title}
            </h2>
            {e.body && (
              <p className="text-sm text-[var(--t3)] mb-2">{e.body}</p>
            )}
            {e.features?.length > 0 && (
              <ul className="space-y-1">
                {e.features.map((f: string, i: number) => (
                  <li key={i} className="text-sm text-[var(--t2)] flex gap-2">
                    <span className="text-[var(--green)]">+</span> {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
