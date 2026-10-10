"use client";

import { useEffect, useState } from "react";
import type { DiscoveryDeal } from "@/components/discovery/types";

export interface LocalSavedVehicle {
  id: string;
  title: string;
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  mileage?: number;
  askPrice: number;
  estimatedProfit?: number;
  sellEstimate?: number;
  recommendedMaxBid?: number;
  repairEstimate?: number;
  transportEstimate?: number;
  source: string;
  sourceUrl?: string;
  seller?: string;
  sellerType?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  sellerContactUrl?: string;
  image?: string;
  locationCity?: string;
  locationState?: string;
  dataQuality?: DiscoveryDeal["dataQuality"];
  trustExplanation?: DiscoveryDeal["trustExplanation"];
  firstSeenAt?: string;
  lastSeenAt?: string;
  savedAt: string;
}

const KEY = "mh-local-saved-vehicles-v1";
const EVENT = "mh-local-saved-vehicles-change";
const CAP = 80;

function read(): LocalSavedVehicle[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write(list: LocalSavedVehicle[]) {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, CAP)));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export function toLocalSavedVehicle(deal: DiscoveryDeal): LocalSavedVehicle {
  const title =
    deal.title ||
    `${deal.year ?? ""} ${deal.make ?? ""} ${deal.model ?? ""}`.trim() ||
    "Saved vehicle";

  return {
    id: deal.id,
    title,
    year: deal.year,
    make: deal.make,
    model: deal.model,
    vin: deal.vin,
    mileage: deal.mileage,
    askPrice: Number(deal.askPrice || 0),
    estimatedProfit: deal.trueNetProfit,
    sellEstimate: deal.sellEstimate,
    recommendedMaxBid: deal.recommendedMaxBid,
    repairEstimate: deal.repairEstimate,
    transportEstimate: deal.transportEstimate,
    source: deal.source,
    sourceUrl: deal.sourceUrl,
    seller: deal.seller,
    sellerType: deal.sellerType,
    sellerPhone: deal.sellerPhone,
    sellerEmail: deal.sellerEmail,
    sellerContactUrl: deal.sellerContactUrl,
    image: deal.images?.[0],
    locationCity: deal.locationCity,
    locationState: deal.locationState,
    dataQuality: deal.dataQuality,
    trustExplanation: deal.trustExplanation,
    firstSeenAt: deal.firstSeenAt,
    lastSeenAt: deal.lastSeenAt,
    savedAt: new Date().toISOString(),
  };
}

export function saveLocalVehicle(vehicle: LocalSavedVehicle) {
  if (!vehicle?.id) return false;
  const list = read().filter((item) => item.id !== vehicle.id);
  return write([{ ...vehicle, savedAt: new Date().toISOString() }, ...list]);
}

export function removeLocalVehicle(id: string) {
  if (!id) return false;
  return write(read().filter((item) => item.id !== id));
}

export function useLocalSavedVehicles() {
  const [items, setItems] = useState<LocalSavedVehicle[]>([]);

  useEffect(() => {
    const load = () => setItems(read());
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);

  return {
    items,
    count: items.length,
    has: (id: string) => items.some((item) => item.id === id),
    save: saveLocalVehicle,
    remove: removeLocalVehicle,
    clear: () => write([]),
  };
}
