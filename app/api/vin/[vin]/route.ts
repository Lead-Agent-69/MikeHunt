import { NextRequest, NextResponse } from "next/server";
import { getRecallsCached, getVinDecode } from "@/lib/vehicle/vin-enrichment";
import { internalError } from "@/lib/api/http-error";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";
import { sanitizeMcpVin } from "@/lib/vehicle/mcp-vin";
import { guardVinRoute } from "@/lib/vehicle/vin-route-guard";
import { callSignal, readJsonCapped } from "@/lib/vehicle/deadline";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );
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
  const guard = await guardVinRoute(request);
  if (guard.blocked) return guard.blocked;
  const { deadline, canWrite } = guard;
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

    // Shared with /api/vin/[vin]/specs: vin_decodes cache (180-day TTL) -> NHTSA vPIC extended
    // decode. NHTSA is authoritative and free; mcp.vin is only a fallback when vPIC is down.
    const sb = getSupabase();
    const dec = await getVinDecode(sb, vin, { deadline, canWrite });
    let decoded: any = null;
    let source = "live";
    if (dec) {
      const d = dec.decode;
      source = dec.cached ? (dec.stale ? "cache:stale" : "cache") : "live";
      decoded = {
        year: d.year,
        make: d.make,
        model: d.model,
        trim: d.trim,
        series: d.series,
        bodyClass: d.bodyClass,
        driveType: d.driveType,
        fuelType: d.fuelType,
        engine: d.engine,
        transmission: d.transmissionStyle,
        gvwr: d.gvwr,
        assembly_country: d.plantCountry || undefined,
        assembly_plant:
          [d.plantCompany, d.plantCity, d.plantState]
            .filter(Boolean)
            .join(", ") || undefined,
        decodeClean: d.decodeClean,
      };
    } else if (!deadline.expired()) {
      try {
        const response = await fetch(`https://mcp.vin/${vin}?format=json`, {
          signal: callSignal(deadline),
          headers: {
            Accept: "application/json",
            "User-Agent": "MikeHuntPro/1.0",
          },
        });
        if (response.ok) {
          // Third-party and untrusted: capped at 1 MB, then only a validated year/make/model/trim
          // survive (these become cache keys and recall lookups). Everything else is dropped.
          decoded = sanitizeMcpVin(await readJsonCapped(response));
          if (decoded) source = "mcp.vin";
        }
      } catch {}
    }

    if (!decoded || !(decoded.year || decoded.Year || decoded.modelYear)) {
      return NextResponse.json({
        vin,
        year: null,
        make: null,
        model: null,
        source: "no_decode",
      });
    }

    // Normalize common shapes (NHTSA via vin-enrichment, or the mcp.vin fallback)
    const out = {
      vin,
      year: decoded.year || decoded.Year || decoded.modelYear,
      make: decoded.make || decoded.Make,
      model: decoded.model || decoded.Model,
      trim: decoded.trim || decoded.Trim,
      series: decoded.series ?? null,
      bodyClass: decoded.bodyClass ?? null,
      driveType: decoded.driveType ?? null,
      fuelType: decoded.fuelType ?? null,
      engine: decoded.engine || decoded.Engine || undefined,
      transmission: decoded.transmission ?? null,
      gvwr: decoded.gvwr ?? null,
      assembly_country:
        decoded.assembly_country || decoded.PlantCountry || undefined,
      assembly_plant: decoded.assembly_plant || undefined,
      decodeClean: decoded.decodeClean ?? null,
      // Ignore third-party decoder recall fields (mcp.vin reports 0); NHTSA below is the source.
      recalls: undefined as number | undefined,
    };

    // One recall source of truth, shared with /api/vin/[vin]/specs: NHTSA recalls for the decoded
    // make/model/year family, resolved through the recalls catalog (vPIC "F-250" is filed as
    // "F-250 SD") and cached 7 days. There is no public VIN-level recall API. null = lookup failed,
    // never a fake 0.
    let recallCampaigns: any[] = [];
    if (out.make && out.model && out.year) {
      const r = await getRecallsCached(
        sb,
        String(out.make),
        String(out.model),
        Number(out.year),
        { deadline, canWrite },
      );
      out.recalls = r?.count ?? undefined;
      recallCampaigns = r?.campaigns ?? [];
    }

    // Best-effort backfill into existing rows
    // (only on a live decode; cache hits were already backfilled when first decoded)
    if (source === "live") await backfillDecoded(vin, out as any);

    return NextResponse.json({
      ...out,
      recalls: out.recalls ?? null,
      recallCampaigns,
      recallsScope: "model_year",
      source,
      cached: source.startsWith("cache"),
    });
  } catch (error: any) {
    console.error("VIN Decode Error:", error);
    return internalError("vin:[vin]", error);
  }
}
