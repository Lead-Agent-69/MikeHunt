"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Scoped metadata only: never let an old search publish health for a newer search. */
export function useScopedSourceHealth<T extends object>(
  url: string | null,
  enabled = true,
) {
  enabled = enabled && Boolean(url);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ url, enabled });
  latest.current = { url, enabled };
  const request = useRef<{
    id: number;
    controller: AbortController;
    cancel: () => void;
  } | null>(null);
  const generation = useRef(0);
  const [result, setResult] = useState<{
    url: string | null;
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ url, data: null, loading: false, error: null });
  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!url || !latest.current.enabled || latest.current.url !== url)
        return null;
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = null;
      request.current?.cancel();
      const controller = new AbortController();
      const id = ++generation.current;
      let cancelWait = () => {};
      const cancelled = new Promise<never>((_resolve, reject) => {
        cancelWait = () => reject(new Error("Source status cancelled"));
      });
      const timeout = setTimeout(() => {
        controller.abort();
        cancelWait();
      }, 15000);
      request.current = {
        id,
        controller,
        cancel: () => {
          clearTimeout(timeout);
          controller.abort();
          cancelWait();
        },
      };
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
      try {
        const data = await Promise.race([
          (async () => {
            const response = await fetch(url, {
              cache: "no-store",
              signal: controller.signal,
            });
            if (!response.ok) throw new Error("Source status unavailable");
            return response.json();
          })(),
          cancelled,
        ]);
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
    debounce.current = timer;
    return () => {
      clearTimeout(timer);
      debounce.current = null;
      request.current?.cancel();
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
