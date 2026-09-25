import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  );
}

async function cacheLookup(vin: string) {
  const supabase = getSupabase();
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

  const { data: d } = await supabase
    .from("deals")
    .select("year,make,model,trim,vin,updated_at")
    .eq("vin", vin)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (d && d.year)
    return {
      vin,
      year: d.year,
      make: d.make,
      model: d.model,
      trim: d.trim,
      source: "cache:deals",
    };
  return null;
}

async function backfillDecoded(
  vin: string,
  decoded: {
    year?: any;
    make?: any;
    model?: any;
    trim?: any;
    assembly_country?: any;
    assembly_plant?: any;
  },
) {
  try {
    const supabase = getSupabase();
    const { data: drow } = await supabase
      .from("deals")
      .select("id")
      .eq("vin", vin)
      .limit(1)
      .maybeSingle();
    if (drow?.id) {
      await supabase
        .from("deals")
        .update({
          year: decoded.year ?? undefined,
          make: decoded.make ?? undefined,
          model: decoded.model ?? undefined,
          trim: decoded.trim ?? undefined,
          assembly_country: decoded.assembly_country ?? undefined,
          assembly_plant: decoded.assembly_plant ?? undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", drow.id);
    }
  } catch {}
}

async function fetchNhtsaRecalls(vin: string): Promise<number> {
  try {
    const r = await fetch(
      `https://api.nhtsa.gov/recalls/recallsByVIN?vin=${encodeURIComponent(vin)}`,
    );
    if (!r.ok) return 0;
    const j = await r.json();
    const count = Array.isArray(j?.results) ? j.results.length : j?.Count || 0;
    return Number(count) || 0;
  } catch {
    return 0;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ vin: string }> },
) {
  try {
    const { vin } = await params;

    if (!vin || vin.length < 10) {
      return NextResponse.json({ error: "Invalid VIN" }, { status: 400 });
    }

    // Minimal cache from recent deals/vehicles
    const cached = await cacheLookup(vin);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    // mcp.vin first (free, no auth) per North Star
    let decoded: any = null;
    try {
      const response = await fetch(`https://mcp.vin/${vin}?format=json`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "DealerHuntPro/1.0",
        },
      });
      if (response.ok) {
        decoded = await response.json();
      }
    } catch {}

    if (!decoded || !decoded.year) {
      // Fallback to NHTSA decode
      const fb = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(vin)}?format=json`,
      );
      if (fb.ok) {
        const data = await fb.json();
        const r = data.Results?.[0] || {};
        decoded = {
          vin,
          year: r.ModelYear,
          make: r.Make,
          model: r.Model,
          trim: r.Trim,
          engine:
            (r.EngineConfiguration || "") +
            " " +
            (r.EngineCylinders || "") +
            " Cyl",
          // Assembly origin (tariff-aware sourcing) — NHTSA returns plant fields.
          assembly_country: r.PlantCountry || undefined,
          assembly_plant:
            [r.PlantCompanyName, r.PlantCity, r.PlantState]
              .filter(Boolean)
              .join(", ") || undefined,
        };
      }
    }

    if (!decoded || !decoded.year) {
      return NextResponse.json({
        vin,
        year: null,
        make: null,
        model: null,
        source: "no_decode",
      });
    }

    // Normalize common shapes
    const out = {
      vin,
      year: decoded.year || decoded.Year || decoded.modelYear,
      make: decoded.make || decoded.Make,
      model: decoded.model || decoded.Model,
      trim: decoded.trim || decoded.Trim,
      engine: decoded.engine || decoded.Engine || undefined,
      assembly_country:
        decoded.assembly_country || decoded.PlantCountry || undefined,
      assembly_plant: decoded.assembly_plant || undefined,
      recalls: decoded.recalls ?? undefined,
    };

    // Fetch real recalls if not present
    if (out.recalls === undefined) {
      out.recalls = await fetchNhtsaRecalls(vin);
    }

    // Best-effort backfill into existing rows
    await backfillDecoded(vin, out as any);

    return NextResponse.json({ ...out, source: "live" });
  } catch (error: any) {
    console.error("VIN Decode Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
