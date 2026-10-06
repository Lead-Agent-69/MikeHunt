"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { fetchSimilarPrompt, sendDealSignal } from "@/lib/reco/client";

/** Ask only after this much visible time on the listing (the backend's "meaningful" dwell). */
export const PROMPT_AFTER_DWELL_MS = 15_000;
const FACET_RE = /^model:[a-z0-9]{1,40}\|[a-z0-9]{1,40}$/;
const closedKey = (facet: string) => `mh_reco_prompt_closed:${facet}`;

type Prompt = { facet: string; label?: string; message: string };

// Uses fetchSimilarPrompt from lib/reco/client. Any error, 401 or { prompt: null } → nothing shown.
async function readPrompt(): Promise<Prompt | null> {
  const body = await fetchSimilarPrompt();
  const p = body?.prompt;
  if (!p || !FACET_RE.test(String(p.facet)) || !p.message) return null;
  return {
    facet: String(p.facet),
    label: p.label,
    message: String(p.message),
  };
}

/**
 * "Interested in similar?" after enough dwell on a deal. Signed-in viewers of a loaded deal only.
 * Answers go through lib/reco/client (interest_yes / interest_no). Closing it sends nothing and
 * hides it for this session. Non-modal; no scarcity, no countdown.
 */
export function SimilarInterestPrompt({
  dealId,
  enabled,
}: {
  dealId: string;
  enabled: boolean;
}) {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [answered, setAnswered] = useState<"yes" | "no" | null>(null);

  useEffect(() => {
    setPrompt(null);
    setAnswered(null);
    if (!enabled || typeof document === "undefined") return;
    let cancelled = false;
    let visibleMs = 0;
    let since: number | null =
      document.visibilityState === "visible" ? performance.now() : null;
    let timer: number | undefined;

    const ask = async () => {
      const p = await readPrompt();
      if (cancelled || !p) return;
      try {
        if (sessionStorage.getItem(closedKey(p.facet))) return;
      } catch {
        /* storage blocked: still fine to show */
      }
      setPrompt(p);
    };
    const schedule = () => {
      window.clearTimeout(timer);
      if (since == null) return;
      timer = window.setTimeout(
        () => {
          document.removeEventListener("visibilitychange", onVisibility);
          void ask();
        },
        Math.max(0, PROMPT_AFTER_DWELL_MS - visibleMs),
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (since != null) visibleMs += performance.now() - since;
        since = null;
        window.clearTimeout(timer);
      } else if (since == null) {
        since = performance.now();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [dealId, enabled]);

  if (!prompt) return null;

  const answer = (yes: boolean) => {
    sendDealSignal({
      kind: yes ? "interest_yes" : "interest_no",
      facet: prompt.facet,
    });
    setAnswered(yes ? "yes" : "no");
  };
  const close = () => {
    try {
      sessionStorage.setItem(closedKey(prompt.facet), "1");
    } catch {
      /* ignore */
    }
    setPrompt(null);
  };

  // Portal to <body>: the deal page wraps content in a transformed (animated) container, which
  // would make "fixed" relative to that container instead of the viewport.
  return createPortal(
    <div
      role="region"
      aria-label="Interested in similar listings?"
      data-testid="reco-similar-prompt"
      className="fixed inset-x-3 bottom-[calc(80px+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-[var(--b2)] bg-[var(--s0)] p-4 shadow-[var(--shadow)] md:inset-x-auto md:bottom-6 md:left-6 md:w-[380px]"
    >
      <button
        onClick={close}
        aria-label="Close"
        className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-lg text-[var(--t4)] hover:bg-[var(--s2)]"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      {answered ? (
        <p className="pr-8 text-sm font-semibold text-[var(--t2)]">
          {answered === "yes"
            ? "Got it. For You will lean toward listings like these."
            : "Got it. We won't ask about these again for a while."}
        </p>
      ) : (
        <>
          <p className="pr-8 text-[10px] font-black uppercase tracking-wider text-[var(--t4)]">
            Interested in similar?
          </p>
          <p className="mt-1 pr-8 text-sm text-[var(--t2)]">{prompt.message}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => answer(true)}
              className="min-h-11 flex-1 rounded-xl bg-[var(--blue)] px-3 text-sm font-bold text-white"
            >
              Yes, more like these
            </button>
            <button
              onClick={() => answer(false)}
              className="min-h-11 flex-1 rounded-xl border border-[var(--b2)] px-3 text-sm font-bold text-[var(--t2)]"
            >
              Not interested
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
