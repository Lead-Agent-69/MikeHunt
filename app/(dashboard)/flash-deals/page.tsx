import { createServerComponentClient } from "@/lib/supabase";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DealCard } from "@/components/shared/DealCard";
import { Ico } from "@/components/shared/Ico";
import { EmptyState } from "@/components/shared/EmptyState";
import { Deal } from "@/lib/data/deals-service";
import { Zap } from "lucide-react";

export const revalidate = 0; // Force dynamic rendering for real-time data

export default async function FlashDealsPage() {
  const supabase = createServerComponentClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  // Fetch the top "Flash Deals"
  const { data: flashDeals, error } = await supabase
    .from("deals")
    .select(
      `
      *,
      dealer:dealer_id (
        id,
        name,
        company_name,
        location_state,
        location_city
      )
    `,
    )
    .eq("deal_verdict", "go")
    .gte("profit_score", 90)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--t1)] flex items-center gap-2">
            <Zap className="text-yellow-500 fill-yellow-500/20" size={28} />
            Flash Deals
          </h1>
          <p className="text-[var(--t2)] mt-2 max-w-2xl">
            The highest-margin arbitrage opportunities on the market right now.
            These are deals with a profit score of 90+ and a "Go" verdict. Act
            fast before they sell.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[var(--t3)] text-sm bg-[var(--s2)] px-3 py-1.5 rounded-[var(--r2)] border border-[var(--b1)] shadow-sm">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>Live feed active</span>
        </div>
      </header>

      {error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-[var(--r3)] text-red-600 dark:text-red-400">
          Failed to load flash deals: {error.message}
        </div>
      ) : flashDeals && flashDeals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {flashDeals.map((deal: any) => (
            <div key={deal.id} className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-500/50 to-orange-500/50 rounded-[calc(var(--r3)+2px)] blur opacity-20 group-hover:opacity-40 transition-opacity duration-300 pointer-events-none" />
              <DealCard
                {...(deal as unknown as Deal)}
                mmrValue={deal.mmrValue || 0}
                profitEstimate={deal.profitEstimate || 0}
                onClick={() => (window.location.href = `/deal/${deal.id}`)}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="search"
          title="No flash deals right now"
          message="We're constantly scanning the market. When a massive arbitrage opportunity appears, it will show up here instantly."
          action={{
            label: "Back to Dashboard",
            href: "/find",
          }}
        />
      )}
    </div>
  );
}
