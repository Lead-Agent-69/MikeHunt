"use client";

import Link from "next/link";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { proxiedImage } from "@/lib/image-url";

// Horizontal "Recently viewed" strip for the feed pages — jump straight back to a deal/lead you just
// looked at. Renders nothing until there are ≥2 items, so it never clutters a first-run screen.

export function RecentlyViewed({
  kind,
  accent = "var(--t1)",
}: {
  kind: "car" | "home";
  accent?: string;
}) {
  const items = useRecentlyViewed(kind);
  if (items.length < 2) return null;

  return (
    <section className="min-w-0">
      <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--t4)] mb-2">
        Recently viewed
      </h2>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {items.map((it) => (
          <Link
            key={`${it.kind}-${it.id}`}
            href={it.href}
            className="shrink-0 w-40 rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] overflow-hidden hover:border-[var(--b3)] transition-colors"
          >
            <div className="h-20 bg-[var(--s2)]">
              {it.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxiedImage(it.image)}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : null}
            </div>
            <div className="p-2">
              <div
                className="text-[12px] font-bold truncate"
                style={{ color: accent }}
              >
                {it.title}
              </div>
              {it.sub && (
                <div className="text-[10px] text-[var(--t4)] truncate">
                  {it.sub}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
