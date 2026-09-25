"use client";

import { useEffect, useState } from "react";

export interface DealerDefaults {
  auctionFee: number;
  reconCost: number;
  dailyFloorRate: number;
  targetProfit: number;
  homeState: string;
}

const defaultValues: DealerDefaults = {
  auctionFee: 450,
  reconCost: 500,
  dailyFloorRate: 35,
  targetProfit: 3500,
  homeState: "CA",
};

export default function useDealerDefaults() {
  const [defaults, setDefaults] = useState<DealerDefaults>(defaultValues);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // First try to load from local storage
    try {
      const cached = localStorage.getItem("dh_dealer_defaults");
      if (cached) {
        setDefaults(JSON.parse(cached));
      }
    } catch {}

    // Fetch from API
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        if (data.profile) {
          const newDefaults = {
            auctionFee:
              data.profile.auction_fee_default ?? defaultValues.auctionFee,
            reconCost:
              data.data?.profile?.recon_cost_default ?? defaultValues.reconCost,
            dailyFloorRate:
              data.profile.daily_floor_rate ?? defaultValues.dailyFloorRate,
            targetProfit:
              data.profile.target_profit ?? defaultValues.targetProfit,
            homeState: data.profile.home_state ?? defaultValues.homeState,
          };
          setDefaults(newDefaults);
          try {
            localStorage.setItem(
              "dh_dealer_defaults",
              JSON.stringify(newDefaults),
            );
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { ...defaults, loading };
}
