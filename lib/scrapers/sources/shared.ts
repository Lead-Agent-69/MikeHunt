import { Deal } from "@/types";
import { upsertDeals } from "../pipeline";

function parseTitle(title: string): Partial<Deal> {
  const m = title.match(/^(\d{4})\s+(\w+)\s+(.+)/);
  if (!m) return {};
  return {
    year: parseInt(m[1], 10),
    make: m[2],
    model: m[3].split(" ").slice(0, 2).join(" "),
  };
}

async function getMarketValue(
  vin?: string,
  year?: number,
  make?: string,
  model?: string,
): Promise<number | undefined> {
  if (vin && vin.length === 17) {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/value/${vin}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.marketValue) return data.marketValue;
      }
    } catch {}
  }

  if (year && make && model) {
    try {
      const res = await fetch(
        `https://marketcheck-prod.apigee.net/v2/search/car/active?api_key=${process.env.MARKETCHECK_API_KEY}&year=${year}&make=${make}&model=${model}&rows=10`,
      );
      if (!res.ok) return undefined;
      const data = await res.json();
      const prices = (data.listings || data.deals || [])
        .map((l: any) => l.price)
        .filter((p: number) => p > 0);
      if (!prices.length) return undefined;
      return Math.round(
        prices.reduce((a: number, b: number) => a + b, 0) / prices.length,
      );
    } catch {}
  }

  return undefined;
}

export async function enrichAndStore(raw: any) {
  try {
    const parsed = raw.title ? parseTitle(raw.title) : {};
    const year = raw.year || parsed.year;
    const make = raw.make || parsed.make;
    const model = raw.model || parsed.model;

    const marketValue = await getMarketValue(raw.vin, year, make, model);

    const deal: Partial<Deal> = {
      source: raw.source,
      source_deal_id: raw.external_id,
      source_url: raw.listing_url,
      title: raw.title,
      year,
      make,
      model,
      trim: raw.trim,
      vin: raw.vin,
      mileage: raw.odometer,
      condition: raw.title_type || raw.condition || "unknown",
      ask_price: raw.asking_price || raw.current_bid || raw.price || 0,
      buy_now_price: raw.current_bid,
      mmr_value: marketValue,
      location_city: raw.location_city,
      location_state: raw.location_state,
      location_zip: raw.location_zip,
      images: raw.images || [],
      description: raw.description,
      seller: raw.seller,
      seller_type: raw.seller_type,
      auction_end: raw.sale_date,
      bid_count: raw.bid_count,
      damage_type: raw.damage_type,
      transport_cost: raw.transport_cost,
      repair_estimate: raw.repair_estimate,
      is_arbitrage_opportunity: raw.is_arbitrage_opportunity,
      scraped_at: new Date().toISOString(),
    };

    // Scoring/analysis happens authoritatively in upsertDeals (lib/scoring/deal-analyzer).
    await upsertDeals([deal]);
  } catch (e) {
    console.error("[Enrich] Error:", e);
  }
}
