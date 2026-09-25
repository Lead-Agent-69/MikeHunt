"use client";

import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { createClientComponentClient } from "@/lib/supabase";
import { Ico } from "@/components/shared/Ico";
import { DealCard } from "@/components/shared/DealCard";

export default function AlertsPage() {
  const supabase = createClientComponentClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
    markAllRead();
  }, [supabase.auth]);

  const fetchAlerts = async (uid: string) => {
    try {
      const { data } = await supabase
        .from("user_feed_inbox")
        .select(
          `
          id,
          status,
          created_at,
          deal_id,
          deals (*)
        `,
        )
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    } catch (err) {
      console.warn("Table might not exist yet");
      return [];
    }
  };

  const {
    data: alerts = [],
    error,
    isLoading: loading,
    mutate,
  } = useSWR(userId ? ["alerts", userId] : null, ([, uid]) =>
    fetchAlerts(uid as string),
  );

  async function markAllRead() {
    await fetch("/api/alerts/unread", { method: "POST" });
  }

  async function dismissAlert(id: string) {
    await supabase.from("user_feed_inbox").delete().eq("id", id);
    mutate(
      alerts.filter((a: any) => a.id !== id),
      false,
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fadeUp">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-[var(--t1)] mb-1">
            Scrape Inbox
          </h1>
          <p className="text-[var(--t3)]">
            Matches from your automated background searches.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[var(--t3)]">
          Loading your inbox...
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-16 glass-panel">
          <Ico
            name="alert-triangle"
            size={32}
            className="mx-auto text-[var(--t4)] mb-3"
          />
          <h3 className="text-lg font-bold text-[var(--t1)] mb-1">
            Inbox Empty
          </h3>
          <p className="text-[var(--t3)] max-w-sm mx-auto">
            You don't have any new matches. Set up automated searches in the
            Automations tab to get alerts here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {alerts.map((alert: any) => {
            const deal = alert.deals;
            if (!deal) return null;
            return (
              <div key={alert.id} className="relative group">
                {alert.status === "unread" && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-[var(--amber)] rounded-full shadow-[0_0_8px_var(--amber)] z-10" />
                )}
                <div className="absolute -top-3 -right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="p-1.5 bg-[var(--s2)] text-[var(--t2)] hover:bg-[var(--red)] hover:text-white rounded-full shadow-lg border border-[var(--b2)]"
                    title="Dismiss alert"
                  >
                    <Ico name="x" size={14} />
                  </button>
                </div>
                <DealCard
                  id={deal.id}
                  source={deal.source}
                  year={deal.year}
                  make={deal.make}
                  model={deal.model}
                  askPrice={deal.ask_price}
                  mmrValue={deal.mmr_value}
                  profitEstimate={deal.profit_estimate}
                  profitScore={deal.profit_score}
                  locationCity={deal.location_city}
                  locationState={deal.location_state}
                  mileage={deal.mileage}
                  condition={deal.condition}
                  damageType={deal.damage_type}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
