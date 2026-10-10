// app/api/saved-cars/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";
import { redactSavedCarForNonFlipDesk } from "@/lib/saved/saved-car-desk-redact";

export const dynamic = "force-dynamic";
const SAVED_STATUSES = [
  "active",
  "price_drop",
  "price_increase",
  "ending_soon",
  "unavailable",
  "acquired",
  "watching",
  "passed",
  "archived",
];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = createServerComponentClient();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json({ error: "Invalid update" }, { status: 400 });
    const { status, notes, tags } = body;
    if (
      (status !== undefined && !SAVED_STATUSES.includes(status)) ||
      (notes !== undefined &&
        (typeof notes !== "string" || notes.length > 10000)) ||
      (tags !== undefined &&
        (!Array.isArray(tags) ||
          tags.length > 20 ||
          tags.some(
            (tag: unknown) => typeof tag !== "string" || tag.length > 100,
          ))) ||
      (status === undefined && notes === undefined && tags === undefined)
    ) {
      return NextResponse.json(
        { error: "Invalid saved vehicle update" },
        { status: 400 },
      );
    }

    const {
      data: { user },
    } = await getServerUser();
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const updates: any = {};
    if (status) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (tags !== undefined) updates.tags = tags;
    updates.last_checked = new Date().toISOString();

    const { data, error } = await supabase
      .from("saved_cars")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;
    if (data?.id !== id || data?.user_id !== userId)
      return NextResponse.json(
        { error: "Saved vehicle not found" },
        { status: 404 },
      );

    // Same read-time desk gate as GET /api/saved-cars: the updated row echoes the snapshot.
    const flipDesk = await resolveCallerFlipDesk();
    return NextResponse.json(
      flipDesk || !data ? data : redactSavedCarForNonFlipDesk(data),
    );
  } catch (error: any) {
    console.error("[SAVED-CARS-ID] PUT error:", error);
    console.error("[saved-cars/id]", error.message);
    return NextResponse.json(
      { error: "Failed to update saved car" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = createServerComponentClient();
    const { id } = await params;

    const {
      data: { user },
    } = await getServerUser();
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const expectedOwner = request.headers.get("X-Save-Owner");
    if (expectedOwner && expectedOwner !== userId)
      return NextResponse.json(
        { error: "Account changed. Reload and retry." },
        { status: 409 },
      );

    const { data, error } = await supabase
      .from("saved_cars")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id,user_id");

    if (error) throw error;
    if (data?.length !== 1 || data[0]?.id !== id || data[0]?.user_id !== userId)
      return NextResponse.json(
        { error: "Saved vehicle not found" },
        { status: 404 },
      );

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error("[SAVED-CARS-ID] DELETE error:", error);
    console.error("[saved-cars/id]", error.message);
    return NextResponse.json(
      { error: "Failed to delete saved car" },
      { status: 500 },
    );
  }
}
