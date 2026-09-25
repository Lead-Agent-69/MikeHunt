// app/(dashboard)/save/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useDealerId } from "@/hooks/useDealerId";

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
    handleSaveUrl(targetUrl);
  }, [resolvedSearchParams, dealerId, dealerLoading]);

  const handleSaveUrl = async (urlToSave: string) => {
    try {
      const response = await fetch("/api/save-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlToSave }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to analyze this listing.");
      }

      setStatus("success");

      // Auto-redirect to the deal page after 1.5 seconds
      setTimeout(() => {
        router.push(`/deal/${data.dealId}`);
      }, 1500);
    } catch (err: any) {
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
              <div className="relative flex items-center justify-center">
                <div
                  className="w-16 h-16 rounded-full border-4 border-t-[var(--amber)] animate-spin"
                  style={{
                    borderColor: "var(--amber-lo)",
                    borderTopColor: "var(--amber)",
                  }}
                ></div>
                <Loader2 className="absolute text-[var(--amber)] animate-pulse w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-black text-[var(--t1)]">
                  Analyzing shared vehicle...
                </h2>
                <p className="text-sm text-[var(--t3)] leading-relaxed">
                  Scraping vehicle specifications and estimating market value
                  profit scores.
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
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-[var(--green)]"
                style={{
                  background: "var(--glo)",
                  border: "1px solid var(--gbd)",
                }}
              >
                <CheckCircle2 className="w-8 h-8" />
              </div>
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
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-[var(--red)]"
                style={{
                  background: "rgba(239,91,107,0.12)",
                  border: "1px solid var(--rbd)",
                }}
              >
                <AlertCircle className="w-8 h-8" />
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
