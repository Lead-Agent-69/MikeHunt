import { NextRequest, NextResponse } from "next/server";
import { getRecallCount } from "@/lib/vehicle/nhtsa";
import { internalError } from "@/lib/api/http-error";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
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


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ vin: string }> },
) {
  const rl = rateLimit(request, {
    key: "vin-decode",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return tooManyRequests(rl);
  try {
    const { vin: rawVin } = await params;
    // VIN alphabet only (no I/O/Q), 11–17 chars. The VIN is interpolated into upstream URLs, so
    // anything else (slashes, ?, &, ..) is rejected rather than forwarded.
    const vin = String(rawVin || "")
      .toUpperCase()
      .replace(/[\s-]/g, "");
    if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) {
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
          "User-Agent": "MikeHuntPro/1.0",
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
      // Ignore third-party decoder recall fields (mcp.vin reports 0); NHTSA below is the source.
      recalls: undefined as number | undefined,
    };

    // One recall source of truth, shared with /api/vin/[vin]/specs: NHTSA recallsByVehicle for the
    // decoded make/model/year. (The old recallsByVIN URL isn't a public endpoint, so it always
    // returned 0 while /specs showed the real count.) null = lookup failed, never a fake 0.
    if (out.make && out.model && out.year) {
      out.recalls =
        (await getRecallCount(
          String(out.make),
          String(out.model),
          Number(out.year),
        )) ?? undefined;
    }

    // Best-effort backfill into existing rows
    await backfillDecoded(vin, out as any);

    return NextResponse.json({
      ...out,
      recalls: out.recalls ?? null,
      recallsScope: "model_year",
      source: "live",
    });
  } catch (error: any) {
    console.error("VIN Decode Error:", error);
    return internalError("vin:[vin]", error);
  }
}
