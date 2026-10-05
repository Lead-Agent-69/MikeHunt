import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { parseVehicleQuery } from "@/lib/search/parse-vehicle-query";

// GET /api/scan/parse?q= — turn a /scan search box query into structured filters.
// Deterministic and keyless (no model call), so it stays public like /scan itself.
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "scan-parse", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const q = new URL(req.url).searchParams.get("q");
  if (!q) return NextResponse.json({});
  return NextResponse.json(parseVehicleQuery(q));
}
