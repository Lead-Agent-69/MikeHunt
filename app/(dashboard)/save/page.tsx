// app/(dashboard)/save/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useDealerId } from "@/hooks/useDealerId";
import { MikeHuntLoader } from "@/components/brand/MikeHuntLoader";

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

  useEffect(() => {
    if (dealerLoading) return;
    if (!dealerId) {
      setStatus("error");
      setErrorMessage("Please sign in to save vehicles.");
      return;
    }

    // A shared URL might be in the 'url' parameter or embedded in 'text' parameter
    const urlParam = resolvedSearchParams.url || "";
    const textParam = resolvedSearchParams.text || "";
    const titleParam = resolvedSearchParams.title || "";

    // Regex to extract URL from text if needed
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    let targetUrl = "";

    if (urlParam && urlParam.startsWith("http")) {
      targetUrl = urlParam;
    } else if (textParam && textParam.startsWith("http")) {
      targetUrl = textParam;
    } else {
      const match = textParam.match(urlRegex) || titleParam.match(urlRegex);
      if (match) {
        targetUrl = match[0];
      }
    }

    if (!targetUrl) {
      setStatus("error");
      setErrorMessage(
        "No valid vehicle URL detected. Please share a valid Copart, Craigslist, or IAA URL.",
      );
      return;
    }

    setSharedUrl(targetUrl);
    const id = ++requestId.current;
    controller.current?.abort();
    handleSaveUrl(targetUrl, id);
    return () => controller.current?.abort();
  }, [resolvedSearchParams, dealerId, dealerLoading]);

  const handleSaveUrl = async (urlToSave: string, id: number) => {
    const abortController = new AbortController();
    controller.current = abortController;
    try {
      const response = await fetch("/api/save-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlToSave }),
        signal: abortController.signal,
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to analyze this listing.");
      }

      if (id !== requestId.current) return;
      setStatus("success");
      router.replace(`/deal/${data.dealId}`);
    } catch (err: any) {
      if (err.name === "AbortError" || id !== requestId.current) return;
      console.error("[SAVE-PAGE] Error:", err);
      setStatus("error");
      setErrorMessage(
        err.message || "An unexpected error occurred during analysis.",
      );
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <Card className="w-full max-w-md border border-[var(--b2)] bg-[var(--s0)] shadow-lg overflow-hidden">
        <CardContent className="p-8 flex flex-col items-center text-center space-y-6">
          {status === "analyzing" && (
            <>
              <MikeHuntLoader
                state="loading"
                size={72}
                label="Analyzing shared vehicle"
              />
              <div className="space-y-2">
                <h2 className="text-xl font-black text-[var(--t1)]">
                  Analyzing shared vehicle...
                </h2>
                <p className="text-sm text-[var(--t3)] leading-relaxed">
                  Checking vehicle details and estimating market value profit
                  scores.
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
                label="Shared vehicle analysis"
              />
              <div className="space-y-2">
                <h2 className="text-xl font-black text-[var(--t1)]">
                  Deal Analyzed!
                </h2>
                <p className="text-sm text-[var(--t3)]">
                  Successfully stored and scored. Redirecting to analyzer...
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
                  label="Shared vehicle analysis"
                />
                <AlertCircle className="w-7 h-7 text-[var(--red)]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-black text-[var(--t1)] font-bold">
                  Analysis Failed
                </h2>
                <p className="text-sm text-[var(--red)] font-medium leading-relaxed">
                  {errorMessage}
                </p>
              </div>
              <button
                onClick={() => router.push("/scan")}
                className="w-full py-2.5 px-4 rounded-lg text-white font-bold text-sm transition-all border-none"
                style={{ background: "var(--grad)" }}
              >
                Go to Scan Stream
              </button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
