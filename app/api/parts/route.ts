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
    let getUserResult: { data: { user: any }; error: any };
    try {
      getUserResult = await getServerUser();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const {
      data: { user },
      error: authError,
    } = getUserResult;
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("parts_estimates")
      .select("*")
      .eq("dealer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      // If table doesn't exist yet, return empty array gracefully
      if (error.code === "42P01" || error.code === "PGRST205")
        return NextResponse.json([]);
      throw error;
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error("Failed to fetch parts estimates:", err);
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
    let getUserResult2: { data: { user: any }; error: any };
    try {
      getUserResult2 = await getServerUser();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const {
      data: { user },
      error: authError,
    } = getUserResult2;
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { vehicle_name, total_estimate, parts_list } = body;

    if (
      !vehicle_name ||
      typeof total_estimate !== "number" ||
      !Array.isArray(parts_list)
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("parts_estimates")
      .insert({
        dealer_id: user.id,
        vehicle_name,
        total_estimate,
        parts_list,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        return NextResponse.json(
          { error: "Parts estimator features are temporarily unavailable." },
          { status: 400 },
        );
      }
      throw error;
    }
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("Failed to save parts estimate:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
