// app/api/saved-cars/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = createServerComponentClient();
    const { id } = await params;
    const body = await request.json();
    const { status, notes, tags } = body;

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

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[SAVED-CARS-ID] PUT error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update saved car" },
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

    const { error } = await supabase
      .from("saved_cars")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[SAVED-CARS-ID] DELETE error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete saved car" },
      { status: 500 },
    );
  }
}
