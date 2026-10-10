import { NextRequest, NextResponse } from "next/server";
import { ScraperAlertService } from "@/lib/scrapers/tools/alerts";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createServerComponentClient } from "@/lib/supabase";
import { sendSavedSearchDigests } from "@/lib/alerts/saved-search-digest";

export const dynamic = "force-dynamic";
// Daily cron: ScraperAlertService.processAlerts sends email, then push, then a mark-sent update per
// alert, in sequence (N+1; kera audit #9). Explicit limit so it is not cut at a 10s legacy default.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const service = new ScraperAlertService({
      resendApiKey: process.env.RESEND_API_KEY,
    });

    const result = await service.processAlerts();
    // Saved searches set to "Daily digest": one email per user with the day's matches.
    const digest = await sendSavedSearchDigests(createServerComponentClient());

    return NextResponse.json({
      message: `Processed ${result.processed} pending alerts, sent ${result.emailsSent} emails, ${digest.emailsSent} digests`,
      ...result,
      digest,
    });
  } catch (error) {
    console.error("Alert processing error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
