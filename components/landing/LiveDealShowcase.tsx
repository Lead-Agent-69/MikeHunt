import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createServerComponentClient } from "@/lib/supabase";
import { proxiedImage } from "@/lib/image-url";

// The landing's "show, don't tell" — REAL, active, photo-having deals scored RIGHT NOW, rendered server-side
// so they're in the initial HTML (SEO + instant, no spinner). A visitor SEES the product works before they
// ever sign up: real cars, real prices, real net profit, BUY badges. The single most convincing thing on the
// page. Just a teaser (8), so the full feed + contacts + all inventory stay behind the free signup.

const money = (n?: number | null) =>
  n != null ? `$${Math.round(n).toLocaleString()}` : "";

// Cached 5 min so the PUBLIC landing page can't hammer the DB under traffic (the data barely changes).
const getShowcaseDeals = unstable_cache(
  async () => {
    const sb = createServerComponentClient();
    const { data } = await sb
      .from("deals")
      .select(
        "id, year, make, model, ask_price, true_net_profit, deal_verdict, location_state, images, profit_score",
      )
      .eq("active", true)
      .gt("ask_price", 0)
      .not("images", "is", null)
      .order("profit_score", { ascending: false, nullsFirst: false })
      .order("last_seen_at", { ascending: false })
      .limit(28);
    return (data || [])
      .filter((d) => Array.isArray(d.images) && d.images[0])
      .slice(0, 8);
  },
  ["landing-showcase-deals"],
  { revalidate: 300 },
);

export async function LiveDealShowcase() {
  let deals: any[] = [];
  try {
    deals = await getShowcaseDeals();
  } catch {
    return null;
  }
  if (deals.length < 4) return null;

  return (
    <section className="w-full max-w-6xl mx-auto px-6 pt-4 pb-16">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="serif text-2xl md:text-3xl font-semibold text-[var(--t1)]">
            Real deals, scored right now
          </h2>
          <p className="mt-1 text-sm text-[var(--t4)]">
            Live from the engine — not a demo. This is a sliver of what&apos;s
            inside.
          </p>
        </div>
        <Link
          href="/register"
          className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-transform hover:translate-x-0.5"
          style={{ background: "var(--grad)" }}
        >
          See them all →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {deals.map((d) => {
          const profit =
            d.true_net_profit != null ? Number(d.true_net_profit) : null;
          const isBuy = d.deal_verdict === "go";
          return (
            <Link
              key={d.id}
              href="/register"
              className="group relative overflow-hidden rounded-2xl border border-[var(--b1)] bg-[var(--s0)]"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-[var(--s2)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proxiedImage(d.images[0])}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
                  }}
                />
                {isBuy && (
                  <span className="absolute left-2 top-2 rounded-full bg-[var(--green)] px-2 py-0.5 text-[11px] font-black text-black">
                    BUY
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 p-2.5">
                  <div className="text-base font-black text-white drop-shadow">
                    {money(d.ask_price)}
                  </div>
                  {profit != null && profit > 0 && (
                    <div className="text-xs font-black text-[var(--green)] drop-shadow">
                      +{money(profit)} profit
                    </div>
                  )}
                </div>
              </div>
              <div className="p-2.5">
                <div className="truncate text-[13px] font-bold text-[var(--t1)]">
                  {[d.year, d.make, d.model].filter(Boolean).join(" ")}
                </div>
                <div className="text-[11px] text-[var(--t4)]">
                  {d.location_state || "—"}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-7 text-center sm:hidden">
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-bold text-white shadow-[var(--shadow)]"
          style={{ background: "var(--grad)" }}
        >
          See them all — free →
        </Link>
      </div>
    </section>
  );
}
