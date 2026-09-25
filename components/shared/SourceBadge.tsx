import React from "react";
import { sourceMeta, tint, buyTerms } from "@/lib/sources/source-meta";

// The dealer's at-a-glance "where is this from?" — a prominent, brand-colored chip with the REAL source
// name (Carvana, eBay Motors, CarGurus…), not tiny gray "EBAY_MOTORS". One look tells them the source
// and, optionally, the channel (Auction / Retail / Private) so the numbers read correctly.

export function SourceBadge({
  source,
  size = "md",
  showChannel = false,
  className = "",
}: {
  source?: string | null;
  size?: "sm" | "md" | "lg";
  showChannel?: boolean;
  className?: string;
}) {
  const m = sourceMeta(source);
  const pad =
    size === "lg"
      ? "px-2.5 py-1 text-[12px]"
      : size === "sm"
        ? "px-1.5 py-0.5 text-[10px]"
        : "px-2 py-0.5 text-[11px]";
  const dot = size === "lg" ? 7 : size === "sm" ? 5 : 6;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold leading-none whitespace-nowrap ${pad} ${className}`}
      style={{ background: tint(m.color), color: m.color }}
      title={`${m.label}${showChannel ? ` · ${buyTerms(source).channelTag}` : ""}`}
    >
      <span
        className="inline-block shrink-0 rounded-full"
        style={{ width: dot, height: dot, background: m.color }}
      />
      {m.label}
      {showChannel && (
        <span
          className="ml-0.5 rounded-sm px-1 py-px text-[9px] font-extrabold uppercase tracking-wide opacity-80"
          style={{ background: tint(m.color, 0.18) }}
        >
          {buyTerms(source).channelTag}
        </span>
      )}
    </span>
  );
}
