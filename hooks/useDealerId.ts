"use client";

import { useEffect, useState } from "react";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

/**
 * Returns the current authenticated user's id to be used as dealerId.
 * Falls back to null while loading or if not authenticated.
 */
export function useDealerId() {
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    if (!isSupabaseConfigured()) {
      fetch("/api/auth/whoami")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!mounted) return;
          setDealerId(data?.id ?? null);
          setLoading(false);
        })
        .catch((err) => {
          if (!mounted) return;
          setError(err instanceof Error ? err.message : "Failed to load user");
          setDealerId(null);
          setLoading(false);
        });

      return () => {
        mounted = false;
      };
    }

    const supabase = createClientComponentClient();

    // Initial fetch
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return;
      if (error) {
        setError(error.message);
        setDealerId(null);
      } else {
        setDealerId(session?.user?.id ?? null);
      }
      setLoading(false);
    });

    // Listen for auth changes (login/logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setDealerId(session?.user?.id ?? null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { dealerId, loading, error };
}
