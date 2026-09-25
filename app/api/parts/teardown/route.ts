export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { PartsCalculator } from "@/lib/parts/parts-calculator";
import { createServerComponentClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const partsCalculator = new PartsCalculator();
    const body = await request.json();
    const { vehicleInfo, analysisType = "teardown" } = body;

    // Validate vehicle info
    if (
      !vehicleInfo ||
      !vehicleInfo.year ||
      !vehicleInfo.make ||
      !vehicleInfo.model
    ) {
      return NextResponse.json(
        {
          error: "Vehicle year, make, and model are required",
        },
        { status: 400 },
      );
    }

    let result;

    switch (analysisType) {
      case "teardown":
        result = await partsCalculator.calculateTearDown(vehicleInfo);
        break;
      case "compare":
        result = await partsCalculator.compareProfitability(vehicleInfo);
        break;
      case "repairs":
        result = await partsCalculator.estimateRepairCosts(vehicleInfo);
        break;
      default:
        return NextResponse.json(
          {
            error: "Invalid analysis type. Use teardown, compare, or repairs",
          },
          { status: 400 },
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in parts analysis:", error);
    return NextResponse.json(
      {
        error: "Failed to perform parts analysis",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const partsCalculator = new PartsCalculator();
    const { searchParams } = new URL(request.url);
    const vin = searchParams.get("vin");

    if (!vin) {
      return NextResponse.json(
        {
          error: "VIN parameter is required",
        },
        { status: 400 },
      );
    }

    // Decode the real VIN via our VIN decode endpoint (mcp.vin / NHTSA / cache).
    let decoded: any = null;
    try {
      const res = await fetch(
        `${request.nextUrl.origin}/api/vin/${encodeURIComponent(vin)}`,
      );
      if (res.ok) decoded = await res.json();
    } catch {}

    if (!decoded || !decoded.year || !decoded.make || !decoded.model) {
      // Honest failure — we cannot run a real teardown without a real vehicle.
      return NextResponse.json(
        {
          error:
            "Could not decode this VIN into a year/make/model. Teardown unavailable.",
          vin,
        },
        { status: 422 },
      );
    }

    // Pull any real deal data for this VIN to ground purchase price / condition.
    const supabase = createServerComponentClient();
    const { data: deal } = await supabase
      .from("deals")
      .select("ask_price, condition, damage_type")
      .eq("vin", vin)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Map our deal condition enum to the PartsCalculator condition vocabulary.
    const mapCondition = (
      c?: string | null,
    ): "clean" | "salvage" | "rebuilt" | "parts" => {
      if (!c) return "clean";
      const lc = c.toLowerCase();
      if (lc.includes("salvage")) return "salvage";
      if (lc.includes("rebuilt")) return "rebuilt";
      if (lc.includes("parts")) return "parts";
      return "clean";
    };

    const vehicleInfo = {
      vin,
      year: Number(decoded.year),
      make: decoded.make,
      model: decoded.model,
      purchasePrice: deal?.ask_price ?? 0,
      condition: mapCondition(deal?.condition),
      damageType: deal?.damage_type ?? undefined,
    };

    const analysis = await partsCalculator.calculateTearDown(vehicleInfo);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Error getting VIN analysis:", error);
    return NextResponse.json(
      {
        error: "Failed to get VIN analysis",
      },
      { status: 500 },
    );
  }
}
