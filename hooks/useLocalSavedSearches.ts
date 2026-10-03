"use client";

import { useEffect, useState } from "react";

export interface LocalSavedSearch {
  id: string;
  name: string;
  q?: string | null;
  make?: string | null;
  makes?: string[] | null;
  model?: string | null;
  state?: string | null;
  lane?: string | null;
  seller_type?: string | null;
  title_type?: string | null;
  dealer_hosts?: string[] | null;
  dealer_source_ids?: string[] | null;
  min_year?: number | null;
  max_year?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  target_profit?: number | null;
  require_go?: boolean;
  notify_email?: boolean;
  notify_sms?: boolean;
  is_active?: boolean;
  local?: boolean;
  created_at?: string;
}

export const LOCAL_SAVED_SEARCH_KEY = "mh-local-saved-searches-v1";
const EVENT = "mh-local-saved-searches-change";
const CAP = 40;

export function readLocalSavedSearches(): LocalSavedSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(
      localStorage.getItem(LOCAL_SAVED_SEARCH_KEY) || "[]",
    );
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function writeLocalSavedSearches(list: LocalSavedSearch[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    LOCAL_SAVED_SEARCH_KEY,
    JSON.stringify(list.slice(0, CAP)),
  );
  window.dispatchEvent(new Event(EVENT));
}

export function saveLocalSavedSearch(
  search: Omit<LocalSavedSearch, "id" | "local" | "created_at"> &
    Partial<Pick<LocalSavedSearch, "id" | "created_at">>,
) {
  const item: LocalSavedSearch = {
    ...search,
    id: search.id || `local-${Date.now()}`,
    local: true,
    created_at: search.created_at || new Date().toISOString(),
    is_active: search.is_active ?? true,
  };
  const list = readLocalSavedSearches().filter((row) => row.id !== item.id);
  writeLocalSavedSearches([item, ...list]);
  return item;
}

export function removeLocalSavedSearch(id: string) {
  writeLocalSavedSearches(
    readLocalSavedSearches().filter((item) => item.id !== id),
  );
}

export function toggleLocalSavedSearch(id: string, current: boolean) {
  const list = readLocalSavedSearches().map((item) =>
    item.id === id ? { ...item, is_active: !current } : item,
  );
  writeLocalSavedSearches(list);
  return list;
}

export function searchParamsForSavedSearch(search: Partial<LocalSavedSearch>) {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.make) params.set("make", search.make);
  if (search.makes?.length) params.set("makes", search.makes.join(","));
  if (search.model) params.set("model", search.model);
  if (search.state) params.set("state", search.state);
  if (search.lane) params.set("lane", search.lane);
  if (search.seller_type) params.set("sellerType", search.seller_type);
  if (search.title_type) params.set("titleType", search.title_type);
  if (search.dealer_hosts?.length) {
    params.set("dealers", search.dealer_hosts.join(","));
  }
  if (search.dealer_source_ids?.length) {
    params.set("dealerSourceIds", search.dealer_source_ids.join(","));
  }
  if (search.min_year) params.set("minYear", String(search.min_year));
  if (search.max_year) params.set("maxYear", String(search.max_year));
  if (search.min_price) params.set("minPrice", String(search.min_price));
  if (search.max_price) params.set("maxPrice", String(search.max_price));
  if (search.target_profit) {
    params.set("minProfit", String(search.target_profit));
  }
  if (search.require_go) params.set("verdict", "go");
  return params;
}

export function scanHrefForSavedSearch(search: Partial<LocalSavedSearch>) {
  const params = searchParamsForSavedSearch(search);
  params.set("sort", search.require_go ? "profit" : "score");
  return `/scan?${params.toString()}`;
}

export function sourceProofHrefForSavedSearch(
  search: Partial<LocalSavedSearch>,
) {
  return `/sources?${searchParamsForSavedSearch(search).toString()}`;
}

export function useLocalSavedSearches() {
  const [items, setItems] = useState<LocalSavedSearch[]>([]);

  useEffect(() => {
    const load = () => setItems(readLocalSavedSearches());
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
    save: saveLocalSavedSearch,
    remove: removeLocalSavedSearch,
    toggle: toggleLocalSavedSearch,
  };
}
