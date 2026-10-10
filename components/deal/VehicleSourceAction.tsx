import { ArrowUpRight } from "lucide-react";
import { isSourceLandingPage } from "@/lib/sources/listing-link";

export function VehicleSourceAction({
  sourceUrl,
  auction = false,
}: {
  sourceUrl?: string | null;
  auction?: boolean;
}) {
  let href: string | null = null;
  try {
    const url = new URL(sourceUrl || "");
    if (["http:", "https:"].includes(url.protocol)) href = url.href;
  } catch {
    // Missing source links must not become fake actions.
  }
  const className =
    "premium-focus inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--blue)] px-4 text-sm font-semibold text-white";
  const label =
    href && isSourceLandingPage(href)
      ? "Seller website"
      : auction
        ? "View auction"
        : "View listing";
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      aria-label={`${label} (opens in a new tab)`}
    >
      {label}
      <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
    </a>
  ) : (
    <button type="button" disabled className={`${className} opacity-50`}>
      Listing link unavailable
    </button>
  );
}
