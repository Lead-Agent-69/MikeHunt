export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageOperations } from "@/lib/auth/admin-operations";
import { createServerComponentClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!(await canManageOperations(req)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const status = req.nextUrl.searchParams.get("status") || "held";
  if (!["held", "reviewed", "dismissed"].includes(status))
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const { data, error } = await createServerComponentClient({
    includeHeld: true,
  })
    .from("scrape_quarantine")
    .select("id,source,reason,observation,status,last_seen_at")
    .eq("status", status)
    .order("last_seen_at", { ascending: false })
    .limit(100);
  if (error)
    return NextResponse.json(
      { error: "Review queue unavailable" },
      { status: 503 },
    );
  return NextResponse.json(
    {
      rows: data,
      replayPolicy:
        "Re-observe approved sources; rejected facts are never inserted as listings.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(req: NextRequest) {
  if (!(await canManageOperations(req)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z
    .object({
      id: z.string().regex(/^[1-9][0-9]*$/),
      status: z.enum(["reviewed", "dismissed"]),
      expectedStatus: z.enum(["held", "reviewed"]),
    })
    .strict()
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid review" }, { status: 400 });
  const { data, error } = await createServerComponentClient({
    includeHeld: true,
  })
    .from("scrape_quarantine")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .eq("status", parsed.data.expectedStatus)
    .select("id,status")
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: "Review save unavailable" },
      { status: 503 },
    );
  if (!data)
    return NextResponse.json(
      { error: "Review changed; reload before saving" },
      { status: 409 },
    );
  return NextResponse.json({ row: data });
}
