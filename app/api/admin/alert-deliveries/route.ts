export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { canManageOperations } from "@/lib/auth/admin-operations";
import { fetchAllRows } from "@/lib/db/paginate";
import {
  summarizeDeliveries,
  type DeliveryRow,
} from "@/lib/alerts/delivery-summary";

const MAX_ROWS = 20_000;
// Never selected: user_id, provider_message_id, error text. The view is aggregate + per-row stages.
const COLS =
  "id, kind, channel, status, sent_at, delivered_at, opened_at, clicked_at, failed_at, created_at";

// GET /api/admin/alert-deliveries?days=7|30 — admin-only alert delivery funnel.
// Authorization runs before any read (same gate as /api/admin/stats).
export async function GET(req: NextRequest) {
  if (!(await canManageOperations(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = req.nextUrl.searchParams.get("days") === "30" ? 30 : 7;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const supabase = createServerComponentClient();

  try {
    const rows = await fetchAllRows<
      DeliveryRow & { id: string; created_at: string }
    >(
      (from, to) =>
        supabase
          .from("alert_deliveries")
          .select(COLS)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .range(from, to),
      { max: MAX_ROWS },
    );
    return NextResponse.json(
      {
        configured: true,
        days,
        capped: rows.length >= MAX_ROWS,
        summary: summarizeDeliveries(rows),
        recent: rows.slice(0, 25),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err: any) {
    // Most likely the migration hasn't been applied yet.
    const missing = /alert_deliveries|does not exist|schema cache/i.test(
      String(err?.message || err),
    );
    return NextResponse.json(
      {
        configured: !missing,
        days,
        summary: [],
        recent: [],
        error: missing
          ? "alert_deliveries table not found. Apply the migration first."
          : "Could not load delivery data.",
      },
      {
        status: missing ? 200 : 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
