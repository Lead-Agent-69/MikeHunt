import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CURATED_SITES, SITE_TYPE_META } from "@/lib/scrapers/curated-sites";
import { gradeDataQuality } from "@/lib/data-quality";
import { isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function cleanHost(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .replace(/[^a-z0-9.-]/g, "");
}

function siteHost(url: string) {
  try {
    return cleanHost(new URL(url).hostname);
  } catch {
    return cleanHost(url);
  }
}

function matchesHost(inputHost: string, candidateHost: string) {
  const input = cleanHost(inputHost);
  const candidate = cleanHost(candidateHost);
  return (
    input === candidate ||
    input.endsWith(`.${candidate}`) ||
    candidate.endsWith(`.${input}`)
  );
}

function findSite(host: string) {
  return CURATED_SITES.find((site) => {
    const primary = siteHost(site.url);
    const inventory = site.inventoryUrl ? siteHost(site.inventoryUrl) : "";
    return (
      matchesHost(host, primary) ||
      Boolean(inventory && matchesHost(host, inventory))
    );
  });
}

function hostVariants(host: string, site?: ReturnType<typeof findSite>) {
  const values = new Set<string>([cleanHost(host)]);
  if (site) {
    values.add(siteHost(site.url));
    if (site.inventoryUrl) values.add(siteHost(site.inventoryUrl));
  }
  return Array.from(values).filter(Boolean);
}

function freshnessHours(value?: string | null) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.round((Date.now() - ts) / 36e5));
}

function dealerStatus({
  imported,
  cataloged,
  configured,
  error,
}: {
  imported: boolean;
  cataloged: boolean;
  configured: boolean;
  error: string | null;
}) {
  if (error) {
    return {
      userStatus: "Blocked",
      proofLevel: "failed",
      userImpact:
        "This dealer proof query failed before rows could be verified.",
    };
  }
  if (imported) {
    return {
      userStatus: "Working",
      proofLevel: "live_rows",
      userImpact: "This watched dealer has imported rows available for review.",
    };
  }
  if (!cataloged) {
    return {
      userStatus: "Unknown shop",
      proofLevel: "not_cataloged",
      userImpact: "This dealer is not in the curated small-shop catalog yet.",
    };
  }
  if (!configured) {
    return {
      userStatus: "Cataloged",
      proofLevel: "catalog_only",
      userImpact:
        "This shop is recognized, but live import proof needs Supabase connected.",
    };
  }
  return {
    userStatus: "No rows",
    proofLevel: "ran_empty",
    userImpact:
      "This shop is recognized, but no active imported rows match it right now.",
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hosts = (searchParams.get("hosts") || "")
    .split(",")
    .map(cleanHost)
    .filter(Boolean)
    .slice(0, 50);

  if (!hosts.length) {
    return NextResponse.json({
      configured: isSupabaseConfigured(),
      dealers: [],
      total: 0,
    });
  }

  const configured = isSupabaseConfigured();
  const supabase = configured
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      )
    : null;

  const dealers = [];
  for (const host of hosts) {
    const site = findSite(host);
    let rows: any[] = [];
    let error: string | null = null;

    if (supabase) {
      const variants = hostVariants(host, site);
      const filter = variants
        .map((variant) => `source_url.ilike.%${variant}%`)
        .join(",");
      const result = await supabase
        .from("deals")
        .select(
          "id, source, title, images, vin, condition, damage_type, mileage, location_city, location_state, ask_price, auction_end_at, source_url, last_seen_at",
        )
        .eq("active", true)
        .or(filter)
        .order("last_seen_at", { ascending: false })
        .limit(200);

      if (result.error) error = result.error.message;
      rows = result.data || [];
    }

    const rowsWithPhotos = rows.filter(
      (row) => Array.isArray(row.images) && row.images.length > 0,
    ).length;
    const qualityTotal = rows.reduce((sum, row) => {
      const quality = gradeDataQuality({
        images: row.images,
        vin: row.vin,
        titleType:
          (row as any).title_type ||
          (row as any).titleType ||
          (row as any).title_status ||
          (row as any).titleStatus ||
          String((row as any).title || row.condition || "").match(
            /salvage|rebuilt|clean title|parts/i,
          )?.[0] ||
          null,
        condition: row.condition,
        damageType: row.damage_type,
        mileage: row.mileage,
        locationCity: row.location_city,
        locationState: row.location_state,
        askPrice: row.ask_price,
        seller: null,
        sellerType: null,
        auctionEndAt:
          (row as any).auction_end ||
          (row as any).auction_end_at ||
          (row as any).auctionEndAt,
        sourceUrl: row.source_url,
      });
      return sum + quality.score;
    }, 0);
    const averageQuality = rows.length
      ? Math.round(qualityTotal / rows.length)
      : 0;
    const imported = rows.length > 0;
    const cataloged = Boolean(site);
    const typeMeta = site ? SITE_TYPE_META[site.type] : null;
    const newestSeenAt = rows[0]?.last_seen_at || null;
    const photoCoveragePct = rows.length
      ? Math.round((rowsWithPhotos / rows.length) * 100)
      : 0;
    const status = dealerStatus({ imported, cataloged, configured, error });

    dealers.push({
      host,
      cataloged,
      imported,
      readiness: imported
        ? "ready"
        : cataloged
          ? configured
            ? "no_rows"
            : "cataloged"
          : "unknown",
      name: site?.name || host,
      url: site?.url || `https://${host}`,
      inventoryUrl: site?.inventoryUrl || site?.url || `https://${host}`,
      state: site?.state || null,
      city: site?.city || null,
      type: site?.type || "custom",
      typeLabel: typeMeta?.label || "Custom dealer",
      typeBlurb:
        typeMeta?.blurb ||
        "Not in the curated dealer catalog yet; add it to the network before automated imports.",
      rows: rows.length,
      rowsWithPhotos,
      photoCoveragePct,
      averageQuality,
      lastSeenAt: newestSeenAt,
      freshnessHours: freshnessHours(newestSeenAt),
      sampleTitles: rows
        .slice(0, 3)
        .map((row) => row.title)
        .filter(Boolean),
      error,
      userStatus: status.userStatus,
      proofLevel: status.proofLevel,
      userImpact: status.userImpact,
      nextAction: imported
        ? "Review newest imported vehicles."
        : !cataloged
          ? "Add this shop to the curated dealer network."
          : !configured
            ? "Connect Supabase, then run the curated dealer importer."
            : "Run the curated dealer importer or inspect this shop parser.",
    });
  }

  return NextResponse.json({
    configured,
    total: dealers.length,
    importedDealers: dealers.filter((dealer) => dealer.imported).length,
    catalogedDealers: dealers.filter((dealer) => dealer.cataloged).length,
    dealers,
  });
}
