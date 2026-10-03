"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { Ico } from "@/components/shared/Ico";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DeveloperPage() {
  const { data, mutate } = useSWR("/api/keys", fetcher, {
    revalidateOnFocus: false,
  });
  const keys: any[] = data?.keys ?? [];
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "API key" }),
      });
      const json = await res.json();
      if (json.key) {
        setNewKey(json.key);
        setName("");
        mutate();
      }
    } finally {
      setCreating(false);
    }
  }
  async function revoke(id: string) {
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div
      className="max-w-3xl mx-auto px-4 py-8 space-y-6"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div>
        <h1 className="text-2xl font-black text-[var(--t1)] mb-1">
          Developer API
        </h1>
        <p className="text-[var(--t3)]">
          Connect MikeHunt deal intelligence to your DMS, spreadsheets,
          automation tools, or AI clients.
        </p>
      </div>

      {/* Create */}
      <div className="glass-panel p-5 space-y-3">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. My DMS)"
            className="flex-1 bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] px-3 py-2 text-sm text-[var(--t1)]"
          />
          <button
            onClick={create}
            disabled={creating}
            className="px-4 py-2 rounded-[var(--r3)] font-bold text-sm text-white disabled:opacity-50"
            style={{ background: "var(--amber)" }}
          >
            {creating ? "Creating…" : "Create key"}
          </button>
        </div>
        {newKey && (
          <div
            className="rounded-[var(--r2)] p-3"
            style={{ background: "var(--glo)" }}
          >
            <p className="text-xs font-bold text-[var(--green)] mb-1">
              Copy this now — it won’t be shown again:
            </p>
            <code className="text-sm text-[var(--t1)] break-all select-all">
              {newKey}
            </code>
          </div>
        )}
      </div>

      {/* Keys list */}
      <div className="space-y-2">
        {keys.length === 0 ? (
          <div className="glass-panel p-6 text-center text-[var(--t4)] text-sm">
            No keys yet.
          </div>
        ) : (
          keys.map((k) => (
            <div
              key={k.id}
              className="glass-panel p-4 flex items-center justify-between gap-3"
            >
              <div>
                <p className="font-bold text-[var(--t1)] text-sm">
                  {k.name}{" "}
                  {k.revoked && (
                    <span className="text-[var(--red)] text-xs">· revoked</span>
                  )}
                </p>
                <p className="text-xs text-[var(--t4)] font-mono">
                  {k.key_prefix}… · {k.request_count || 0} requests
                  {k.last_used_at
                    ? ` · last ${new Date(k.last_used_at).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              {!k.revoked && (
                <button
                  onClick={() => revoke(k.id)}
                  className="px-3 py-1.5 text-sm font-semibold rounded bg-[rgba(255,56,92,0.1)] text-[var(--red)] hover:bg-[var(--red)] hover:text-white transition-colors"
                >
                  Revoke
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Docs */}
      <div className="glass-panel p-5">
        <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold mb-2">
          API quickstart
        </p>
        <p className="mb-3 text-sm leading-relaxed text-[var(--t3)]">
          Use the public deals endpoint when another system needs structured
          rows: verdict, estimated profit, max buy, vehicle fields, and source
          proof.
        </p>
        <pre className="text-xs text-[var(--t2)] overflow-x-auto bg-[var(--s0)] rounded-[var(--r2)] p-3 whitespace-pre-wrap">{`curl "https://mikehunt-69.vercel.app/api/public/v1/deals?state=TX&minProfit=2000" \\
  -H "x-api-key: dhp_your_key"

# Returns buy-ready deals with estimated_net_profit + recommended_max_bid.
# Filters: state, make, minProfit, verdict (go|hold|all), limit (≤200).`}</pre>
      </div>

      {/* MCP */}
      <div className="glass-panel p-5">
        <div className="flex items-center gap-2 mb-2">
          <Ico name="bot" size={14} className="text-[var(--amber)]" />
          <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold">
            MCP server
          </p>
        </div>
        <p className="text-sm text-[var(--t3)] mb-3">
          Connect Claude, Cursor, or any MCP-capable client to ask the market in
          plain English. It returns MikeHunt’s deal math and source proof, not
          raw listings.
        </p>
        <pre className="text-xs text-[var(--t2)] overflow-x-auto bg-[var(--s0)] rounded-[var(--r2)] p-3 whitespace-pre-wrap">{`# Add to your MCP client config (HTTP transport):
{
  "mcpServers": {
    "MikeHunt": {
      "url": "https://mikehunt-69.vercel.app/api/mcp",
      "headers": { "x-api-key": "dhp_your_key" }
    }
  }
}

# Tools: search_deals, market_pulse
# Example: find F-150 deals in Texas under a $15k max buy.`}</pre>
      </div>
    </div>
  );
}
