import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const categories = new Set([
  "price",
  "photos",
  "vehicle",
  "estimate",
  "usability",
  "other",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (body: object, status: number) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function POST(req: NextRequest) {
  try {
    return await submitFeedback(req);
  } catch {
    return reply(
      {
        error:
          "Feedback could not be confirmed. Your report is still here; try again.",
      },
      503,
    );
  }
}

async function submitFeedback(req: NextRequest) {
  const db = await createClient();
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError)
    return reply(
      { error: "Account unavailable. Your report has not been saved." },
      503,
    );
  if (!user?.id) return reply({ error: "Sign in to report a listing." }, 401);
  if (
    (req.headers.get("origin") &&
      req.headers.get("origin") !== req.nextUrl.origin) ||
    req.headers.get("sec-fetch-site") === "cross-site"
  )
    return reply({ error: "Submit feedback from this app." }, 403);
  if (
    !/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || "")
  )
    return reply({ error: "Expected JSON." }, 415);
  const rl = rateLimit(req, {
    key: "listing-feedback",
    identity: user.id,
    limit: 5,
    windowMs: 60000,
  });
  if (!rl.allowed) return tooManyRequests(rl);

  let body: any;
  const reader = req.body?.getReader();
  if (!reader) return reply({ error: "Enter a report." }, 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 12288) {
        await reader.cancel();
        return reply({ error: "Report is too large." }, 413);
      }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return reply({ error: "Invalid report." }, 400);
  } finally {
    reader.releaseLock();
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.id !== "string" ||
    !uuid.test(body.id) ||
    typeof body.listing_id !== "string" ||
    !uuid.test(body.listing_id) ||
    !categories.has(body.category) ||
    typeof body.comment !== "string" ||
    !body.comment.trim() ||
    body.comment.trim().length > 2000 ||
    /\u0000/.test(body.comment)
  )
    return reply(
      { error: "Choose a category and enter a report of 1-2,000 characters." },
      400,
    );

  const row = {
    id: body.id,
    user_id: user.id,
    listing_id: body.listing_id,
    category: body.category,
    comment: body.comment.trim(),
  };
  const { data, error } = await db
    .from("feedback")
    .insert(row)
    .select("id")
    .abortSignal(AbortSignal.timeout(5000))
    .single();
  if (error?.code === "23505") {
    // A timed-out response can be retried with the same ID, but never confirms another owner's report.
    const existing = await db
      .from("feedback")
      .select("id, listing_id, category, comment")
      .eq("id", row.id)
      .eq("user_id", user.id)
      .abortSignal(AbortSignal.timeout(5000))
      .maybeSingle();
    if (
      !existing.error &&
      existing.data?.listing_id === row.listing_id &&
      existing.data?.category === row.category &&
      existing.data?.comment === row.comment
    )
      return reply({ saved: true, id: row.id }, 200);
    return reply(
      { error: "This report could not be confirmed. Try a new report." },
      409,
    );
  }
  if (error?.code === "P0001")
    return reply(
      { error: "Daily report limit reached. Please try tomorrow." },
      429,
    );
  if (error || data?.id !== row.id)
    return reply(
      {
        error:
          "Feedback could not be saved. Your report is still here; try again.",
      },
      503,
    );
  return reply({ saved: true, id: data.id }, 201);
}
