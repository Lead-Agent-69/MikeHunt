"use client";

import React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Ico } from "@/components/shared/Ico";

async function readNote(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok || typeof data?.note !== "string")
    throw new Error(
      response.status === 401
        ? "Sign in to view your private notes."
        : "Your notes could not be loaded. Try again.",
    );
  return { note: data.note };
}

// A new listing gets a new editor: a late response cannot replace another car's draft.
export function DealNotes({ dealId }: { dealId: string }) {
  return <NoteEditor key={dealId} dealId={dealId} />;
}

function NoteEditor({ dealId }: { dealId: string }) {
  const { data, error, mutate } = useSWR(
    `/api/deals/${dealId}/notes`,
    readNote,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const saved = data?.note ?? "";
  const [draft, setDraft] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");
  const active = React.useRef<AbortController | null>(null);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);
  const value = draft ?? saved;
  const dirty = draft !== null && draft !== saved;
  const known = !!data;
  const save = async () => {
    if (!known || !dirty || active.current) return;
    const submitted = value;
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch(`/api/deals/${dealId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: submitted }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || result?.note !== submitted)
        throw new Error(
          response.status === 401
            ? "Sign in again to save. Your draft is still here."
            : "Your note was not confirmed. Your draft is still here; reload before retrying.",
        );
      if (!mounted.current) return;
      await mutate({ note: submitted }, { revalidate: false });
      if (!mounted.current) return;
      setDraft((current) => (current === submitted ? null : current));
      toast.success("Note saved");
    } catch (failure) {
      if (!mounted.current) return;
      const message = controller.signal.aborted
        ? "The save was not confirmed. Your draft is still here; reload before retrying."
        : failure instanceof Error
          ? failure.message
          : "Your note was not confirmed. Your draft is still here.";
      setSaveError(message);
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) active.current = null;
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <section
      aria-label="Your private notes"
      className="rounded-[var(--r3)] p-4"
      style={{ background: "var(--s1)", boxShadow: "var(--shadow)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <label
          htmlFor={`note-${dealId}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--t3)]"
        >
          <Ico name="list" size={13} /> Your notes
        </label>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={saving || !known}
            className="min-h-11 min-w-11 rounded-[var(--r1)] px-3 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "var(--grad)" }}
          >
            {saving ? "Saving..." : "Save note"}
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="mb-2 text-sm text-[var(--t2)]">
          {error.message}{" "}
          <button
            type="button"
            onClick={() => void mutate().catch(() => undefined)}
            className="min-h-11 px-2 font-semibold underline"
          >
            Reload notes
          </button>
        </div>
      )}
      {!known && !error && (
        <p role="status" className="mb-2 text-sm text-[var(--t2)]">
          Loading your notes...
        </p>
      )}
      <textarea
        id={`note-${dealId}`}
        value={value}
        disabled={!known}
        onChange={(event) => {
          setDraft(event.target.value);
          setSaveError("");
        }}
        rows={3}
        maxLength={4000}
        placeholder="Offer made, seller's price, follow-up date..."
        className="w-full resize-y rounded-[var(--r2)] p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
        style={{
          background: "var(--s2)",
          color: "var(--t1)",
          border: "1px solid var(--s3)",
        }}
      />
      <p role="status" className="mt-1 text-xs text-[var(--t3)]">
        {saving
          ? "Saving your note..."
          : dirty
            ? "Unsaved changes. Choose Save note to keep them."
            : known
              ? "Private to your account."
              : ""}
      </p>
      {saveError && (
        <p role="alert" className="mt-2 text-sm text-[var(--t2)]">
          {saveError}
        </p>
      )}
    </section>
  );
}
