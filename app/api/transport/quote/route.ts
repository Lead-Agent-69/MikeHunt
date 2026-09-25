import { NextRequest, NextResponse } from "next/server";
import { STATE_COORDS } from "@/lib/geo";
import { roadRoute, type LatLng } from "@/lib/geo/routing";

// GET /api/transport/quote — driving-distance transport quote via OSRM (OpenStreetMap routing).
//
// Accepts, most-precise first:
//   • fromLat/fromLng + toLat/toLng  → exact lot-to-home routing (the deal page passes these)
//   • from/to state codes            → state-centroid routing (backward-compatible fallback)
// Real road miles + drive time replace the old straight-line × 1.3 fudge, so the transport cost that
// feeds true_net_profit is honest (e.g. intra-state hauls like San Diego→Sacramento are 504mi, not "45").

const PER_MILE = 0.78; // North Star rate
const HOOKUP_FEE = 50;
const MIN_QUOTE = 150;

function coord(latRaw: string | null, lngRaw: string | null): LatLng | null {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function stateCoord(code: string | null): LatLng | null {
  if (!code) return null;
  const c = STATE_COORDS[code.toUpperCase()];
  return c ? { lat: c.lat, lng: c.lon } : null;
}

export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;

    // Precise coords win; else fall back to state centroids.
    const from =
      coord(sp.get("fromLat"), sp.get("fromLng")) || stateCoord(sp.get("from"));
    const to =
      coord(sp.get("toLat"), sp.get("toLng")) || stateCoord(sp.get("to"));

    if (!from || !to) {
      return NextResponse.json(
        {
          error:
            "Provide fromLat/fromLng+toLat/toLng or valid from/to state codes",
        },
        { status: 400 },
      );
    }

    const route = await roadRoute(from, to);
    if (!route) {
      return NextResponse.json(
        { error: "Could not compute a route for those coordinates" },
        { status: 422 },
      );
    }

    const quote = Math.max(
      MIN_QUOTE,
      Math.round(route.miles * PER_MILE) + HOOKUP_FEE,
    );

    return NextResponse.json({
      from: sp.get("from")?.toUpperCase() || null,
      to: sp.get("to")?.toUpperCase() || null,
      miles: route.miles,
      minutes: route.minutes,
      driveTime: `${Math.floor(route.minutes / 60)}h ${route.minutes % 60}m`,
      quote,
      mode: route.mode, // "road" (real OSRM) | "estimate" (haversine fallback)
    });
  } catch (error: any) {
    console.error("Transport Quote Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
