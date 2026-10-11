"use client";

import React, { useState } from "react";
import { ExternalLink, Store } from "lucide-react";
import { vendorIdentity } from "@/lib/sources/vendor-identity";

export function SourceBadge({
  source,
  sourceUrl,
  size = "md",
  showChannel = false,
  className = "",
}: {
  source?: string | null;
  sourceUrl?: string | null;
  size?: "sm" | "md" | "lg";
  showChannel?: boolean;
  className?: string;
}) {
  const vendor = vendorIdentity(source, sourceUrl);
  const [failedMark, setFailedMark] = useState<string>();
  const textSize =
    size === "lg" ? "text-xs" : size === "sm" ? "text-[10px]" : "text-[11px]";
  const classes = `relative z-20 inline-flex min-h-11 max-w-[10rem] items-center gap-1.5 rounded-md border border-[var(--b1)] bg-[var(--s1)] px-2 py-1 leading-tight text-[var(--t1)] ${textSize} ${className}`;
  const contents = (
    <>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white text-neutral-700">
        {vendor.mark && failedMark !== vendor.mark ? (
          <img
            src={vendor.mark}
            width={18}
            height={18}
            alt=""
            onError={() => setFailedMark(vendor.mark)}
          />
        ) : (
          <Store size={16} aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words font-semibold">{vendor.label}</span>
        {showChannel && vendor.channelLabel && (
          <span className="block text-[var(--t3)]">{vendor.channelLabel}</span>
        )}
        {vendor.host && vendor.host !== vendor.label && (
          <span className="block truncate text-[var(--t3)]">{vendor.host}</span>
        )}
      </span>
      {vendor.href && (
        <ExternalLink size={12} className="shrink-0" aria-hidden="true" />
      )}
    </>
  );
  return vendor.href ? (
    <a
      href={vendor.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View listing at ${vendor.label} (opens in a new tab)`}
      title={vendor.host}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className={`${classes} hover:bg-[var(--s2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]`}
    >
      {contents}
    </a>
  ) : (
    <span className={classes}>{contents}</span>
  );
}
