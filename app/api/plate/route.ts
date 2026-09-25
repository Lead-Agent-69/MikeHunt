export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// GET /api/plate?plate=ABC1234&state=TX — decode a license plate to a VIN (auction floors often only
// show a plate). Uses Plate2VIN when PLATE2VIN_KEY is set; otherwise returns a clear 503 (Pro feature).
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "plate", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const { searchParams } = new URL(req.url);
  const plate = (searchParams.get("plate") || "").trim();
  const state = (searchParams.get("state") || "").trim().toUpperCase();
  if (!plate || !state)
    return NextResponse.json(
      { error: "plate and state required" },
      { status: 400 },
    );

  const key = process.env.PLATE2VIN_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error:
          "Plate lookup not configured. Set PLATE2VIN_KEY to enable this Pro feature.",
      },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(
      `https://api.platetovin.com/v1?plate=${encodeURIComponent(plate)}&state=${state}`,
      {
        headers: { Authorization: `Bearer ${key}` },
      },
    );
    const data = await res.json().catch(() => ({}));
    const vin = data.vin || data?.data?.vin || null;
    if (!vin)
      return NextResponse.json(
        { error: "No VIN found for that plate." },
        { status: 404 },
      );
    return NextResponse.json({ vin, plate, state });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Plate lookup failed" },
      { status: 502 },
    );
  }
}
