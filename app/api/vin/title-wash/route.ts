export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

// Internal listing locations cannot establish title transfers or title-washing risk.
export async function GET(req: NextRequest) {
  const vin = (req.nextUrl.searchParams.get("vin") || "").trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return NextResponse.json(
      { error: "A valid 17-character VIN is required" },
      { status: 400 },
    );
  }
  return NextResponse.json(
    {
      available: false,
      error:
        "Verified title history is not available. Request the title documents and an independent vehicle-history report.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
