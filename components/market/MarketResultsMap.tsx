"use client";

import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { LocateFixed } from "lucide-react";
import { Mono } from "@/components/shared/Mono";
import type { MapPoint } from "@/components/map/DealerMap";
import type { MarketListing } from "@/lib/market/explorer";
import { useListingPhotos } from "@/hooks/useListingPhotos";
import { proxiedImage } from "@/lib/image-url";

const DealerMap = dynamic(() => import("@/components/map/DealerMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full min-h-0 place-items-center bg-[var(--s0)] text-xs text-[var(--t4)]">
      Loading interactive map…
    </div>
  ),
});

type MapMetric = "inventory" | "profit";
const profitText = (amount?: number) =>
  amount != null && Number.isFinite(amount)
    ? amount.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      })
    : "Unavailable";

export function marketMapPoints(
  rows: MarketListing[],
  metric: MapMetric = "inventory",
): MapPoint[] {
  return rows
    .filter(
      (row) =>
        Number.isFinite(row.mapLat) &&
        Number.isFinite(row.mapLng) &&
        Math.abs(row.mapLat!) <= 90 &&
        Math.abs(row.mapLng!) <= 180,
    )
    .map((row) => ({
      id: row.id,
      name:
        row.title ||
        `${row.year || ""} ${row.make || ""} ${row.model || ""}`.trim(),
      lat: row.mapLat!,
      lng: row.mapLng!,
      type:
        row.sellerType === "private"
          ? "private"
          : row.lane === "auction" || row.sellerType === "auction"
            ? "auction"
            : row.sellerType === "dealer" || row.lane === "clean-retail"
              ? "dealer"
              : "marketplace",
      label: [
        [row.locationCity, row.locationState].filter(Boolean).join(", "),
        row.mileage != null ? `${row.mileage.toLocaleString()} mi` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      approx: true,
      price:
        metric === "profit"
          ? undefined
          : row.price?.amount || row.askPrice || undefined,
      valueText:
        metric === "profit" ? profitText(row.profitEstimate) : undefined,
      priceLabel:
        metric === "profit" ? "Estimated net profit" : row.price?.label,
      image: row.images?.[0],
      source: row.source,
      url: `/deal/${encodeURIComponent(row.id)}`,
      condition: row.condition,
      damageType: row.damageType,
    }));
}

export function MarketResultsMap({
  rows,
  flipDesk,
}: {
  rows: MarketListing[];
  flipDesk: boolean;
}) {
  const [metric, setMetric] = React.useState<MapMetric>("inventory");
  const points = React.useMemo(
    () => marketMapPoints(rows, metric),
    [rows, metric],
  );
  const [selectedId, setSelectedId] = React.useState("");
  React.useEffect(() => {
    if (!points.some((point) => String(point.id) === selectedId))
      setSelectedId(points[0] ? String(points[0].id) : "");
  }, [points, selectedId]);
  const selected =
    rows.find((row) => row.id === selectedId) ||
    rows.find((row) => row.id === String(points[0]?.id));
  const gallery = useListingPhotos(selected?.images, selected?.id);

  return (
    <section
      aria-label="Interactive results map"
      className="overflow-hidden rounded-2xl border border-[var(--b1)] bg-[var(--s1)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--b1)] px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--t1)]">Results map</h3>
          <p className="text-[10px] text-[var(--t4)]">
            {points.length.toLocaleString()} of {rows.length.toLocaleString()}{" "}
            current-page listings are mapped
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {points.length > 0 && (
            <select
              aria-label="Inspect mapped listing"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="field min-h-10 !w-auto max-w-[14rem] text-xs"
            >
              {points.map((point) => (
                <option key={point.id} value={String(point.id)}>
                  {point.name}
                </option>
              ))}
            </select>
          )}
          {flipDesk && (
            <div className="flex rounded-lg border border-[var(--b1)] p-1">
              {(["inventory", "profit"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={metric === value}
                  onClick={() => setMetric(value)}
                  className="min-h-8 rounded-md px-2 text-[10px] font-semibold capitalize aria-pressed:bg-[var(--s2)] aria-pressed:text-[var(--blue)]"
                >
                  {value === "inventory" ? "Source price" : "Net profit"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {points.length ? (
        <div className="h-[clamp(22rem,35vw,30rem)] min-h-0">
          <DealerMap
            points={points}
            compact
            onPointSelect={(id) => setSelectedId(String(id))}
          />
        </div>
      ) : (
        <div className="grid min-h-[26rem] place-items-center bg-[var(--s0)] p-6 text-center">
          <div>
            <LocateFixed className="mx-auto h-7 w-7 text-[var(--t5)]" />
            <p className="mt-2 text-sm font-semibold text-[var(--t2)]">
              No mapped listings on this page
            </p>
            <p className="mt-1 text-xs text-[var(--t4)]">
              Try another result page or narrow the search to a location.
            </p>
          </div>
        </div>
      )}

      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--b1)] px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {gallery.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proxiedImage(gallery.image)}
                alt={selected.title}
                onError={gallery.reject}
                loading="lazy"
                decoding="async"
                className="h-16 w-24 shrink-0 rounded-md bg-[var(--s2)] object-contain"
              />
            )}
            <div className="min-w-0">
              <p className="break-words text-sm font-bold text-[var(--t1)]">
                {selected.title}
              </p>
            </div>
            <p className="text-[10px] text-[var(--t4)]">
              {[selected.locationCity, selected.locationState]
                .filter(Boolean)
                .join(", ") || "Location not reported"}
              {selected.mileage != null
                ? ` · ${selected.mileage.toLocaleString()} mi`
                : " · mileage not reported"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] text-[var(--t4)]">
                {metric === "profit"
                  ? "Estimated net profit"
                  : selected.price?.label || "Advertised amount"}
              </p>
              <Mono className="text-sm font-black text-[var(--t1)]">
                {metric === "profit"
                  ? profitText(selected.profitEstimate)
                  : selected.price?.amount != null
                    ? `$${selected.price.amount.toLocaleString()}`
                    : "Price not reported"}
              </Mono>
            </div>
            <Link
              href={`/deal/${encodeURIComponent(selected.id)}`}
              className="inline-flex min-h-10 items-center rounded-lg bg-[var(--blue)] px-3 text-xs font-bold text-white"
            >
              Review listing
            </Link>
          </div>
        </div>
      )}
      <p className="border-t border-[var(--b1)] px-4 py-2 text-[9px] text-[var(--t5)]">
        Approximate source locations only. Select a marker for its listing
        preview; verify the seller address before travel.
      </p>
    </section>
  );
}
