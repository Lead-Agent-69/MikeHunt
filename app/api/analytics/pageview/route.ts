export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";

// POST /api/analytics/pageview — fire-and-forget page telemetry.
//
// Purpose: decide which of the 6+ overlapping deal feeds to prune. It records AGGREGATE counts
// only (no user id — see supabase/migrations/20260930140000_page_views.sql), so a page view costs
// exactly one insert and zero auth roundtrips.
//
// Telemetry must never break the page that emitted it: every failure path returns 202 and logs,
// never a 5xx the client would retry or surface.

const MAX_PATH = 300;
const MAX_REFERRER = 500;
const ALLOWED_DEVICES = new Set(["desktop", "tablet", "mobile", "unknown"]);

/** Accept only a well-formed, in-app route string. Rejects absolute URLs, traversal, control chars. */
function sanitizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return null;
  // No protocol-relative ("//evil.com") or traversal.
  if (trimmed.startsWith("//") || trimmed.includes("..")) return null;
  // Strip control characters rather than rejecting the whole view.
  const cleaned = trimmed.replace(/[\u0000-\u001F\u007F]/g, "");
  if (!cleaned || cleaned.length > MAX_PATH) return null;
  return cleaned;
}

function sanitizeReferrer(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, MAX_REFERRER);
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const path = sanitizePath(payload.path);
  if (!path) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const referrer = sanitizeReferrer(payload.referrer);
  const device =
    typeof payload.device === "string" && ALLOWED_DEVICES.has(payload.device)
      ? payload.device
      : "unknown";

  try {
    const supabase = createServerComponentClient();
    const { error } = await supabase.from("page_views").insert({
      path,
      referrer,
      device,
    });

    if (error) {
      // 202 (not 500): a failed telemetry write must not be actionable by the caller.
      console.warn("[analytics] pageview insert failed:", error.message);
      return NextResponse.json({ ok: false }, { status: 202 });
    }
  } catch (err) {
    console.warn(
      "[analytics] pageview error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ ok: false }, { status: 202 });
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
