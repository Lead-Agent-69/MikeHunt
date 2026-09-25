// lib/valuation/manheim.ts
// Manheim Market Report (MMR) — the wholesale-price benchmark dealers price against. It's gated by
// design: api.manheim.com/valuations/vin/{vin} is the real endpoint (returns 401 "Developer Inactive"
// without a key), reachable only with a Manheim developer key (a dealer/partner account can mint one
// at developer.manheim.com). No free anonymous MMR exists. This client activates the moment the key
// envs are set; until then it cleanly no-ops, and the valuation falls back to our own multi-source
// wholesale index. Populating deals.mmr_value flows straight into the analyzer's existing market tier.

const TOKEN_URL = "https://api.manheim.com/oauth/token";
const VAL_URL = (vin: string) =>
  `https://api.manheim.com/valuations/vin/${encodeURIComponent(vin)}`;

let cachedToken: { token: string; exp: number } | null = null;

export function manheimConfigured(): boolean {
  return !!(process.env.MANHEIM_CLIENT_ID && process.env.MANHEIM_CLIENT_SECRET);
}

async function getToken(now: number): Promise<string | null> {
  if (!manheimConfigured()) return null;
  if (cachedToken && cachedToken.exp > now + 30_000) return cachedToken.token;
  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.MANHEIM_CLIENT_ID!,
      client_secret: process.env.MANHEIM_CLIENT_SECRET!,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const token = j?.access_token;
    if (!token) return null;
    cachedToken = {
      token,
      exp: now + (Number(j?.expires_in) || 3600) * 1000,
    };
    return token;
  } catch {
    return null;
  }
}

export interface MMRResult {
  wholesale: number; // MMR wholesale value (mileage/region adjusted when the API provides it)
  retail?: number; // MMR retail value when present
  odometer?: number;
}

const num = (v: unknown): number =>
  Number(String(v ?? "").replace(/[^0-9.]/g, "")) || 0;

/** Pull MMR for a VIN. Returns null when unconfigured or unavailable. Defensive about response shape. */
export async function fetchMMR(
  vin: string,
  now = Date.now(),
): Promise<MMRResult | null> {
  if (!vin || vin.length !== 17) return null;
  const token = await getToken(now);
  if (!token) return null;
  try {
    const res = await fetch(VAL_URL(vin), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    // Manheim returns an items[] of valuations; the adjusted wholesale is the number dealers use.
    const item = Array.isArray(j?.items) ? j.items[0] : j;
    const ws =
      num(item?.adjustedPricing?.wholesale?.average) ||
      num(item?.wholesale?.adjusted) ||
      num(item?.wholesale?.average) ||
      num(item?.wholesale?.base) ||
      num(item?.mmr);
    if (!ws) return null;
    const retail =
      num(item?.adjustedPricing?.retail?.average) ||
      num(item?.retail?.average) ||
      undefined;
    return {
      wholesale: Math.round(ws),
      retail: retail ? Math.round(retail) : undefined,
      odometer: num(item?.odometer) || undefined,
    };
  } catch {
    return null;
  }
}
