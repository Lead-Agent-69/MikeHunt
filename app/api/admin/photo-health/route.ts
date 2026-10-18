export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canManageOperations } from "@/lib/auth/admin-operations";
import { inspectListingPhotos } from "@/lib/images/photo-health";
import { invalidate } from "@/lib/cache";

export async function POST(request: Request) {
  if (!(await canManageOperations(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    (body.dryRun !== undefined && typeof body.dryRun !== "boolean") ||
    (body.limit !== undefined &&
      (!Number.isSafeInteger(body.limit) ||
        body.limit < 1 ||
        body.limit > 20)) ||
    (body.state !== undefined && !/^[A-Z]{2}$/.test(body.state)) ||
    (body.ids !== undefined &&
      (!Array.isArray(body.ids) ||
        body.ids.length < 1 ||
        body.ids.length > 20 ||
        body.ids.some(
          (id: unknown) =>
            typeof id !== "string" ||
            !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id),
        )))
  )
    return NextResponse.json(
      { error: "Invalid photo check options" },
      { status: 400 },
    );
  const dryRun = body.dryRun !== false;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { persistSession: false } },
  );
  let query = sb
    .from("deals")
    .select("id,images,options,updated_at")
    .eq("active", true)
    .not("images", "is", null)
    .neq("images", "{}");
  if (body.ids) query = query.in("id", body.ids);
  else query = query.eq("location_state", body.state ?? "MO");
  const { data, error } = await query
    .order("options->photoAudit->>checkedAt", {
      ascending: true,
      nullsFirst: true,
    })
    .order("id", { ascending: true })
    .limit(body.limit ?? 10);
  if (error)
    return NextResponse.json(
      { error: "Photo checks are temporarily unavailable" },
      { status: 503 },
    );
  const receipt = {
    dryRun,
    checked: 0,
    available: 0,
    unavailable: 0,
    unknown: 0,
    placeholder: 0,
    written: 0,
    conflicts: 0,
    failed: 0,
  };
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(240_000),
  ]);
  try {
    for (const row of data || []) {
      signal.throwIfAborted();
      const result = await inspectListingPhotos(row.images, {
        signal,
      });
      receipt.checked++;
      receipt[result.state]++;
      if (dryRun || result.state === "unknown") continue;
      const photoAudit = {
        state: result.state,
        checkedAt: result.checkedAt,
        verifiedUrl: result.verifiedUrl,
        placeholderUrls: result.placeholderUrls,
        checks: result.checks,
        originalImages: row.images,
      };
      let update = sb
        .from("deals")
        .update({
          updated_at: new Date().toISOString(),
          images: result.images,
          options: { ...row.options, photoAudit },
        })
        .eq("id", row.id);
      update = row.updated_at
        ? update.eq("updated_at", row.updated_at)
        : update.is("updated_at", null);
      const saved = await update.select("id");
      if (saved.error) receipt.failed++;
      else if (!saved.data?.length) receipt.conflicts++;
      else receipt.written++;
    }
  } catch {
    receipt.failed++;
  }
  if (receipt.written)
    for (const prefix of [
      "feed:",
      "discover:",
      "map:",
      "state-counts:",
      "mkt:explore:",
    ])
      invalidate(prefix);
  return NextResponse.json(
    {
      ...receipt,
      photoHealth: true,
      updated: receipt.written,
      partial: receipt.failed > 0 || receipt.conflicts > 0,
    },
    {
      status: receipt.failed || receipt.conflicts ? 503 : 200,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
