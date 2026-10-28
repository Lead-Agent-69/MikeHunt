"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Scoped metadata only: never let an old search publish health for a newer search. */
export function useScopedSourceHealth<T extends { scopeStatus?: unknown }>(
  url: string,
  enabled: boolean,
) {
  const latest = useRef({ url, enabled });
  latest.current = { url, enabled };
  const request = useRef<{ id: number; controller: AbortController } | null>(
    null,
  );
  const generation = useRef(0);
  const [result, setResult] = useState<{
    url: string;
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ url, data: null, loading: false, error: null });
  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!latest.current.enabled || latest.current.url !== url) return null;
      request.current?.controller.abort();
      const controller = new AbortController();
      const id = ++generation.current;
      request.current = { id, controller };
      const current = () =>
        request.current?.id === id &&
        latest.current.url === url &&
        latest.current.enabled &&
        !controller.signal.aborted;
      if (!silent)
        setResult((previous) => ({
          url,
          data: previous.url === url ? previous.data : null,
          loading: true,
          error: null,
        }));
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Source status unavailable");
        const data = await response.json();
        if (!current()) return null;
        if (!data || typeof data !== "object" || Array.isArray(data))
          throw new Error("Source status unavailable");
        setResult({ url, data, loading: false, error: null });
        return data as T;
      } catch {
        if (
          request.current?.id === id &&
          latest.current.url === url &&
          latest.current.enabled
        )
          setResult({
            url,
            data: null,
            loading: false,
            error:
              "Source status is unavailable. Your search filters are unchanged.",
          });
        return null;
      } finally {
        clearTimeout(timeout);
        if (request.current?.id === id) request.current = null;
      }
    },
    [url],
  );
  useEffect(() => {
    if (!enabled) return;
    setResult({ url, data: null, loading: true, error: null });
    const timer = setTimeout(() => void load(), 350);
    return () => {
      clearTimeout(timer);
      request.current?.controller.abort();
      request.current = null;
    };
  }, [url, enabled, load]);
  return {
    error: enabled && result.url === url ? result.error : null,
    data: enabled && result.url === url ? result.data : null,
    isLoading: enabled && (result.url !== url || result.loading),
    refresh: load,
  };
}
