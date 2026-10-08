"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Grid3X3, Loader2, Sparkles } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { type WorkspaceMode } from "@/lib/workspace";

export default function UpgradePage() {
  const workspace = useWorkspace();
  const { intent } = useBuyerIntent();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState<WorkspaceMode>("expanded");
  const dealer = intent?.buyerMode === "dealer";
  useEffect(() => {
    if (workspace.mode) setSelected(workspace.mode);
  }, [workspace.mode]);
  async function apply() {
    if (pending) return;
    setPending(true);
    setError("");
    setSaved(false);
    try {
      await workspace.choose(dealer ? "expanded" : selected);
      setSaved(true);
    } catch {
      setError(
        "Your change was not confirmed. Reload this page before retrying.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 pb-28">
      <header className="space-y-2 border-b border-[var(--b1)] pb-5">
        <h1 className="text-2xl font-bold">Free workspace upgrade</h1>
        <p className="text-sm text-[var(--t2)]">
          Customer tools are free. No card, checkout, recurring charge or trial
          expiry.
        </p>
      </header>
      <section className="space-y-3" aria-label="Workspace choice">
        <h2 className="text-base font-semibold">Choose your workspace</h2>
        {dealer ? (
          <p className="text-sm text-[var(--t3)]">
            Dealer workspaces include every customer tool.
          </p>
        ) : (
          <fieldset className="space-y-3" disabled={pending}>
            <legend className="sr-only">Workspace layout</legend>
            {(["focused", "expanded"] as const).map((mode) => (
              <label
                key={mode}
                className="flex cursor-pointer items-start gap-3 border-b border-[var(--b1)] py-3"
              >
                <input
                  type="radio"
                  name="workspace"
                  value={mode}
                  checked={selected === mode}
                  onChange={() => {
                    setSelected(mode);
                    setSaved(false);
                  }}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block font-semibold">
                    {mode === "focused" ? "Focused" : "Expanded"}
                  </span>
                  <span className="mt-1 block text-sm text-[var(--t3)]">
                    {mode === "focused"
                      ? "Search, saved vehicles, comparison and planning."
                      : "Additional browsing views and specialist tools for your buying profile."}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <p className="text-sm text-[var(--t3)]">
          Both choices include free deal analysis. Your buying profile stays the
          same. Admin operations are not included.
        </p>
      </section>
      {error && (
        <p role="alert" className="text-sm text-[var(--red)]">
          {error}
        </p>
      )}
      {workspace.error && (
        <p role="alert" className="text-sm text-[var(--red)]">
          Your workspace could not be loaded. Reload this page to try again.
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-[var(--green)]"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Free access and workspace choice confirmed.
        </p>
      )}
      {!workspace.isLoading && !workspace.error && !workspace.authed ? (
        <Link
          href="/login?next=%2Fupgrade"
          className="inline-flex min-h-11 items-center gap-2 bg-[var(--t1)] px-4 font-semibold text-[var(--s0)]"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Sign in for free access
        </Link>
      ) : (
        <button
          type="button"
          onClick={apply}
          disabled={pending || workspace.isLoading || !!workspace.error}
          className="inline-flex min-h-11 items-center gap-2 bg-[var(--t1)] px-4 font-semibold text-[var(--s0)] disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          {pending
            ? "Confirming..."
            : workspace.community
              ? "Save workspace choice"
              : "Enable free upgrade"}
        </button>
      )}
      <div className="border-t border-[var(--b1)] pt-4">
        <Link
          href="/tools"
          className="inline-flex min-h-11 items-center gap-2 font-semibold text-[var(--blue)]"
        >
          <Grid3X3 className="h-4 w-4" aria-hidden="true" />
          Open tools
        </Link>
      </div>
      <p className="text-xs text-[var(--t3)]">
        External inspection, transport and marketplace services may have their
        own charges. This choice does not cancel an existing subscription.
      </p>
    </div>
  );
}
