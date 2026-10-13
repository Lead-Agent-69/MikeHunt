// app/(dashboard)/save/page.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, RotateCw } from "lucide-react";
import { useDealerId } from "@/hooks/useDealerId";
import { MikeHuntLoader } from "@/components/brand/MikeHuntLoader";
import { sharedListingUrl } from "@/lib/save-from-url/shared-listing-url";

export default function SavePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; text?: string; title?: string }>;
}) {
  const router = useRouter();
  const { dealerId, loading: dealerLoading } = useDealerId();
  const resolvedSearchParams = React.use(searchParams);

  const [status, setStatus] = useState<"analyzing" | "success" | "error">(
    "analyzing",
  );
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [sharedUrl, setSharedUrl] = useState<string>("");
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const handleSaveUrl = useCallback(
    async (urlToSave: string, id: number) => {
      const abortController = new AbortController();
      controller.current = abortController;
      try {
        const response = await fetch("/api/save-from-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlToSave }),
          signal: abortController.signal,
        });

        const data = await response.json().catch(() => null);
        if (!data || typeof data !== "object")
          throw new Error("We couldn't confirm the saved vehicle. Try again.");

        if (!response.ok || data.error) {
          throw new Error(
            data.error || "Could not save this listing. Try again.",
          );
        }

        if (id !== requestId.current || abortController.signal.aborted) return;
        if (
          typeof data.dealId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            data.dealId,
          )
        )
          throw new Error("We couldn't confirm the saved vehicle. Try again.");
        setStatus("success");
        router.replace(`/deal/${data.dealId}`);
      } catch (err: any) {
        if (abortController.signal.aborted || id !== requestId.current) return;
        console.error("[SAVE-PAGE] Error:", err);
        setStatus("error");
        setErrorMessage(
          err.message || "Could not save this listing. Try again.",
        );
      }
    },
    [router],
  );

  useEffect(() => {
    const id = ++requestId.current;
    controller.current?.abort();
    if (dealerLoading) return;
    const targetUrl = sharedListingUrl(
      resolvedSearchParams.url,
      resolvedSearchParams.text,
      resolvedSearchParams.title,
    );
    setSharedUrl(targetUrl || "");
    if (!dealerId || !targetUrl) {
      setStatus("error");
      setErrorMessage(
        !dealerId
          ? "Please sign in to save vehicles."
          : "No valid vehicle link detected. Share the original vehicle listing link.",
      );
      return;
    }
    setStatus("analyzing");
    setErrorMessage("");
    void handleSaveUrl(targetUrl, id);
    return () => controller.current?.abort();
  }, [resolvedSearchParams, dealerId, dealerLoading, handleSaveUrl]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <Card className="w-full max-w-md border border-[var(--b2)] bg-[var(--s0)] shadow-lg overflow-hidden">
        <CardContent className="p-8 flex flex-col items-center text-center space-y-6">
          {status === "analyzing" && (
            <>
              <MikeHuntLoader
                state="loading"
                size={72}
                label="Saving shared vehicle"
              />
              <div className="space-y-2">
                <h2 className="text-xl font-black text-[var(--t1)]">
                  Saving vehicle...
                </h2>
                <p className="text-sm text-[var(--t3)] leading-relaxed">
                  Reading the original listing and saving available vehicle
                  details.
                </p>
              </div>
              {sharedUrl && (
                <div className="w-full p-3 bg-[var(--s1)] rounded-lg border border-[var(--b1)] text-[10px] font-mono text-[var(--t4)] truncate">
                  {sharedUrl}
                </div>
              )}
            </>
          )}

          {status === "success" && (
            <>
              <MikeHuntLoader
                state="complete"
                size={72}
                label="Vehicle saved"
              />
              <div className="space-y-2">
                <h2 className="text-xl font-black text-[var(--t1)]">
                  Vehicle saved
                </h2>
                <p className="text-sm text-[var(--t3)]">
                  Opening vehicle details...
                </p>
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <div className="flex items-center gap-3">
                <MikeHuntLoader
                  state="error"
                  size={48}
                  label="Vehicle not saved"
                />
                <AlertCircle className="w-7 h-7 text-[var(--red)]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-black text-[var(--t1)] font-bold">
                  {dealerId ? "Could not save vehicle" : "Sign in to save"}
                </h2>
                <p className="text-sm text-[var(--red)] font-medium leading-relaxed">
                  {errorMessage}
                </p>
              </div>
              {!dealerId && sharedUrl && (
                <Link
                  href={`/login?next=${encodeURIComponent(`/save?url=${encodeURIComponent(sharedUrl)}`)}`}
                  className="w-full py-3 px-4 rounded-lg bg-[var(--blue)] text-white font-bold text-sm"
                >
                  Sign in
                </Link>
              )}
              {dealerId && sharedUrl && (
                <button
                  type="button"
                  onClick={() => {
                    controller.current?.abort();
                    const id = ++requestId.current;
                    setStatus("analyzing");
                    setErrorMessage("");
                    void handleSaveUrl(sharedUrl, id);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-[var(--blue)] text-white font-bold text-sm"
                >
                  <RotateCw className="w-4 h-4" aria-hidden="true" /> Try again
                </button>
              )}
              <button
                onClick={() => router.push("/scan")}
                className="w-full py-3 px-4 rounded-lg text-white font-bold text-sm transition-all border-none"
                style={{ background: "var(--grad)" }}
              >
                Find vehicles
              </button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
