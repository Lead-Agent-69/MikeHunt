"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let mounted = true;
    let revision = 0;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const fail = () => {
      if (!mounted) return;
      setError(
        "We couldn't check your account. Check your connection and retry.",
      );
      setDealerId(null);
      setLoading(false);
    };

    if (!isSupabaseConfigured()) {
      fetch("/api/auth/whoami", { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error("Account check failed");
          return res.json();
        })
        .then((data) => {
          if (!mounted) return;
          setDealerId(data?.id ?? null);
          setLoading(false);
        })
        .catch(fail);

      return () => {
        mounted = false;
        controller.abort();
      };
    }

    const supabase = createClientComponentClient();

    // Listen for auth changes (login/logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        revision += 1;
        setDealerId(session?.user?.id ?? null);
        setError(null);
        setLoading(false);
      }
    });

    // Auth events supersede an in-flight initial session read, including logout.
    const initialRevision = revision;
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (!mounted || revision !== initialRevision) return;
        if (error) return fail();
        setDealerId(session?.user?.id ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (revision === initialRevision) fail();
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [attempt]);

  return { dealerId, loading, error, retry };
}
