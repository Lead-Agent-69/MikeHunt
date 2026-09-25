"use client";

import { useState, useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import "leaflet.markercluster";

// Fix Leaflet's default icon paths in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom dark/neon icons for different types
const createIcon = (color: string) => {
  return new L.DivIcon({
    className: "custom-marker",
    html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 10px ${color};"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
};

const icons = {
  auction: createIcon("var(--amber)"),
  dealer: createIcon("var(--blue)"),
  private: createIcon("var(--green)"),
  hub: createIcon("var(--red)"),
};

export interface MapPoint {
  id: string | number;
  name: string;
  lat: number;
  lng: number;
  type?: "auction" | "dealer" | "private" | "hub";
  label?: string;
  // Rich listing fields (housing) → Zillow/Redfin-style price-pill markers + photo-card popups.
  price?: number;
  priceLabel?: string; // "Starting bid" / "Asking" / "Assessed value" …
  score?: number;
  tier?: string; // hot | warm | standard
  image?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  verdict?: string;
  owner?: string;
  ownerCount?: number;
  url?: string; // detail link
}

interface DealerMapProps {
  points?: MapPoint[];
}

const TIER_HEX: Record<string, string> = {
  hot: "#ef4444",
  warm: "#f59e0b",
  standard: "#2dd4bf",
};
// Cars carry a marker `type` (verdict) instead of a tier — color their price pills to match.
const TYPE_HEX: Record<string, string> = {
  private: "#22c55e", // GO
  auction: "#f59e0b", // HOLD / auction
  dealer: "#2563eb",
  hub: "#ef4444",
};
const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
const fmtPrice = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `$${Math.round(n / 1000)}k`
      : `$${n}`;

// Zillow-style price/score pill marker — colored by lead tier (homes) or marker type/verdict (cars).
function pillIcon(p: MapPoint): L.DivIcon {
  const color = TIER_HEX[p.tier ?? ""] || TYPE_HEX[p.type ?? ""] || "#2563eb";
  const text =
    p.price && p.price > 0
      ? fmtPrice(p.price)
      : p.score != null
        ? String(p.score)
        : "•";
  return new L.DivIcon({
    className: "deal-pin",
    html: `<div style="background:${color};color:#fff;font:700 11px/1 system-ui;padding:5px 8px;border-radius:13px;white-space:nowrap;border:1.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)">${esc(text)}</div>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  });
}

// Rich photo-card popup (housing) — image + price + meta + score/verdict + a detail link.
function cardPopup(p: MapPoint): string {
  const color = TIER_HEX[p.tier ?? ""] || "#2563eb";
  const img = p.image
    ? `<img src="${esc(p.image)}" style="width:100%;height:120px;object-fit:cover;display:block" onerror="this.style.display='none'"/>`
    : "";
  const price =
    p.price && p.price > 0
      ? `$${p.price.toLocaleString()}`
      : esc(p.priceLabel || "");
  const meta = [
    p.beds ? `${p.beds} bd` : null,
    p.baths ? `${p.baths} ba` : null,
    p.sqft ? `${p.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `<div style="width:208px;font-family:system-ui">
    ${img}
    <div style="padding:8px 10px">
      <div style="font-weight:800;font-size:15px;color:#111">${price}</div>
      <div style="font-weight:600;font-size:12px;color:#555;margin-top:2px">${esc(p.name)}</div>
      ${meta ? `<div style="font-size:11px;color:#777;margin-top:2px">${meta}</div>` : ""}
      ${
        p.owner
          ? `<div style="font-size:11px;color:#555;margin-top:3px">👤 ${esc(p.owner)}${
              (p.ownerCount ?? 0) >= 5
                ? ` · 🏢 ${p.ownerCount!.toLocaleString()}`
                : ""
            }</div>`
          : ""
      }
      ${
        p.score != null || p.verdict
          ? `<div style="margin-top:5px;font-weight:700;font-size:11px;color:${color}">${
              p.score != null ? `Score ${p.score}` : ""
            }${p.score != null && p.verdict ? " · " : ""}${esc(p.verdict || "")}</div>`
          : ""
      }
      ${p.url ? `<a href="${esc(p.url)}" style="display:block;margin-top:7px;font-weight:700;font-size:12px;color:#0d9488;text-decoration:none">View details →</a>` : ""}
    </div>
  </div>`;
}

// Clustered markers — dense areas collapse into count bubbles; housing points render as price pills with
// photo-card popups, cars keep the dot + text popup.
function ClusteredMarkers({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    const group = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
    });
    for (const p of points) {
      const rich =
        (p.price != null && p.price > 0) || p.image || p.score != null;
      const marker = L.marker([p.lat, p.lng], {
        icon: rich ? pillIcon(p) : icons[p.type ?? "dealer"],
      });
      marker.bindPopup(
        rich
          ? cardPopup(p)
          : `<div style="padding:2px"><strong>${esc(p.name)}</strong>${p.label ? `<br/><span style="font-size:11px;color:#888">${esc(p.label)}</span>` : ""}</div>`,
        rich ? { minWidth: 208, maxWidth: 240 } : undefined,
      );
      group.addLayer(marker);
    }
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
    };
  }, [map, points]);
  return null;
}

export default function DealerMap({ points = [] }: DealerMapProps) {
  const [mapKey, setMapKey] = useState("map-initial");

  useEffect(() => {
    setMapKey(`map-${Date.now()}`);
  }, []);

  const validPoints = points.filter(
    (p) =>
      typeof p.lat === "number" &&
      typeof p.lng === "number" &&
      !Number.isNaN(p.lat) &&
      !Number.isNaN(p.lng),
  );
  // Pills (price/score/image) are self-labeling, so the dot "Network" legend only applies to dot markers.
  const hasPills = validPoints.some(
    (p) => (p.price != null && p.price > 0) || p.image || p.score != null,
  );

  return (
    <div className="w-full h-full min-h-[400px] md:min-h-[500px] rounded-[var(--r4)] overflow-hidden border border-[var(--b1)] shadow-inner z-0 relative">
      <MapContainer
        key={mapKey}
        center={[39.8283, -98.5795]}
        zoom={4}
        style={{ width: "100%", height: "100%", background: "#0a0a0a" }}
        zoomControl={false}
      >
        {/* Dark theme basemap */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        <ClusteredMarkers points={validPoints} />
      </MapContainer>

      {/* Empty-state overlay when there is no real geo data to plot */}
      {validPoints.length === 0 && (
        <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center pointer-events-none px-6 text-center">
          <div
            className="border border-[var(--b1)] rounded-xl px-5 py-4 shadow-lg"
            style={{ background: "var(--s0)" }}
          >
            <p className="text-sm font-bold text-[var(--t1)]">
              No mapped locations yet
            </p>
            <p className="text-xs text-[var(--t4)] mt-1">
              Deals with geocoded locations will appear here.
            </p>
          </div>
        </div>
      )}

      {/* Legend — only for dot markers (cars network view); pill markers are self-labeling. */}
      {validPoints.length > 0 && !hasPills && (
        <div className="absolute bottom-4 left-4 bg-[var(--s1)] border border-[var(--b1)] p-3 rounded-xl shadow-lg z-[1000] flex flex-col gap-2">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--t4)] mb-1">
            Network
          </h4>
          <div className="flex items-center gap-2 text-xs text-[var(--t2)]">
            <div className="w-3 h-3 rounded-full bg-[var(--amber)]"></div>{" "}
            Auctions
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--t2)]">
            <div className="w-3 h-3 rounded-full bg-[var(--blue)]"></div>{" "}
            Wholesalers
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--t2)]">
            <div className="w-3 h-3 rounded-full bg-[var(--red)]"></div> Major
            Hubs
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--t2)]">
            <div className="w-3 h-3 rounded-full bg-[var(--green)]"></div>{" "}
            Private Sellers
          </div>
        </div>
      )}
    </div>
  );
}
