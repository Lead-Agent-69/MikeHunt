"use client";

import React from "react";
import { toast } from "sonner";
import { Ico } from "@/components/shared/Ico";
import { hasWindowSticker } from "@/lib/vehicle/window-sticker";

// Free OEM Monroney (window sticker) by VIN — original MSRP + factory options. Fetches through our
// proxy (which filters OEM error stubs); opens the PDF on success, toasts cleanly when a VIN has none.
export function WindowStickerButton({
  vin,
  make,
}: {
  vin?: string | null;
  make?: string | null;
}) {
  const [loading, setLoading] = React.useState(false);
  if (!vin || vin.length !== 17 || !hasWindowSticker(make)) return null;

  const open = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/window-sticker/${vin}?make=${encodeURIComponent(make || "")}`,
      );
      if (!res.ok) {
        toast.error("No factory window sticker on file for this VIN");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("Couldn't load the window sticker");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={open}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-[var(--r2)] px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60"
      style={{ background: "var(--s2)", color: "var(--t2)" }}
      title="Original factory window sticker (MSRP + options) — free OEM data"
    >
      <Ico
        name={loading ? "refresh" : "list"}
        size={13}
        className={loading ? "animate-spin" : ""}
      />
      {loading ? "Loading…" : "Window Sticker"}
    </button>
  );
}
