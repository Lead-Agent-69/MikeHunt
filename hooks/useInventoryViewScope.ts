"use client";

import { useEffect, useMemo, useState } from "react";
import { buildBuyerIntentQuery, useBuyerIntent } from "./useBuyerIntent";
import { inventoryViewParams } from "@/lib/search/inventory-view-scope";

export function useInventoryViewScope() {
  const { intent, isLoading, savedStates } = useBuyerIntent();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setUrl(window.location.search);
    read();
    window.addEventListener("popstate", read);
    window.addEventListener("inventory-scope-change", read);
    return () => {
      window.removeEventListener("popstate", read);
      window.removeEventListener("inventory-scope-change", read);
    };
  }, []);
  const query = useMemo(() => {
    const explicit = new URLSearchParams(url || "");
    const params =
      explicit.get("scope") === "explicit"
        ? new URLSearchParams()
        : inventoryViewParams(buildBuyerIntentQuery(intent));
    if (explicit.get("scope") !== "explicit" && savedStates !== undefined) {
      params.delete("state");
      params.set("states", savedStates.join(","));
    }
    // An explicit single-state link must not inherit a saved multi-market list.
    if (explicit.has("state") && !explicit.has("states"))
      params.delete("states");
    if (explicit.has("states")) params.delete("state");
    inventoryViewParams(explicit).forEach((value, key) =>
      params.set(key, value),
    );
    Array.from(params.entries()).forEach(([key, value]) => {
      if (!value) params.delete(key);
    });
    return params.toString();
  }, [intent, savedStates, url]);
  return { query, ready: url !== null && !isLoading, intent };
}
