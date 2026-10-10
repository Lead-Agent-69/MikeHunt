"use client";

import useSWR from "swr";
import { useDealerId } from "@/hooks/useDealerId";

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
  homeState: "",
};

export default function useDealerDefaults() {
  const { dealerId, loading: identityLoading } = useDealerId();
  const { data, isLoading, error } = useSWR(
    dealerId ? ["/api/profile", dealerId] : null,
    async ([url]: [string, string]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Cost defaults could not be loaded");
      return response.json();
    },
  );
  const profile = data?.profile || {};
  return {
    auctionFee: profile.auction_fee_default ?? defaultValues.auctionFee,
    reconCost: profile.recon_cost_default ?? defaultValues.reconCost,
    dailyFloorRate: profile.daily_floor_rate ?? defaultValues.dailyFloorRate,
    targetProfit: profile.target_profit ?? defaultValues.targetProfit,
    homeState: profile.home_state ?? defaultValues.homeState,
    loading: identityLoading || isLoading,
    error,
  };
}
