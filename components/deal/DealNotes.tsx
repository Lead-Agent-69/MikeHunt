"use client";

import React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Ico } from "@/components/shared/Ico";

// Per-deal private notes — the dealer's own annotations on a listing ("offered 14k, seller firm at 15;
// call back Friday"). Backed by watchlist.notes. Autosaves on blur; dirty state shows a Save hint.
const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function DealNotes({ dealId }: { dealId: string }) {
  const { data, mutate } = useSWR(`/api/deals/${dealId}/notes`, fetcher, {
    revalidateOnFocus: false,
  });
  const saved = data?.note ?? "";
  const [note, setNote] = React.useState<string | null>(null);
  const value = note ?? saved;
  const dirty = note != null && note !== saved;
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: value }),
      });
      if (!res.ok) throw new Error();
      await mutate({ note: value }, { revalidate: false });
      setNote(null);
      toast.success("Note saved");
    } catch {
      toast.error("Couldn't save note — sign in to keep notes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="rounded-[var(--r3)] p-4"
      style={{ background: "var(--s1)", boxShadow: "var(--shadow)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
          <Ico name="list" size={13} /> Your notes
        </span>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="rounded-[var(--r1)] px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-60"
            style={{ background: "var(--grad)" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => setNote(e.target.value)}
        onBlur={save}
        rows={3}
        placeholder="Private notes — offer made, seller's bottom line, follow-up date…"
        className="w-full resize-y rounded-[var(--r2)] p-2.5 text-sm outline-none"
        style={{
          background: "var(--s2)",
          color: "var(--t1)",
          border: "1px solid var(--s3)",
        }}
      />
    </div>
  );
}
