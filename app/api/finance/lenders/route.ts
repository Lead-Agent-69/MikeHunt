export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }

  try {
    const supabase = createServerComponentClient();
    const {
      data: { user },
      error: authError,
    } = await getServerUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("finance_lenders")
      .select("*")
      .eq("dealer_id", user.id);

    if (error) {
      if (error.code === "42P01") return NextResponse.json([]);
      throw error;
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }

  try {
    const supabase = createServerComponentClient();
    const {
      data: { user },
      error: authError,
    } = await getServerUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, monthly_rate, setup_fee, advance_percentage } = body;

    if (!name || typeof monthly_rate !== "number") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("finance_lenders")
      .insert({
        dealer_id: user.id,
        name,
        monthly_rate,
        setup_fee: setup_fee || 0,
        advance_percentage: advance_percentage || 100,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
