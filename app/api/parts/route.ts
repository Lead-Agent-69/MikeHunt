export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      items: [],
      message:
        "Supabase is not configured, so saved parts estimates are unavailable.",
    });
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
      // Missing storage is unavailable, not proof that the user has no saved budgets.
      if (error.code === "42P01" || error.code === "PGRST205")
        return NextResponse.json(
          { error: "Saved budgets are temporarily unavailable." },
          { status: 503 },
        );
      throw error;
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error("Failed to fetch parts estimates:", err);
    return internalError("parts", err);
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        error:
          "Supabase is not configured, so parts estimates cannot be saved.",
      },
      { status: 400 },
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
      typeof vehicle_name !== "string" ||
      !vehicle_name.trim() ||
      vehicle_name.length > 200 ||
      typeof total_estimate !== "number" ||
      !Number.isFinite(total_estimate) ||
      total_estimate < 0 ||
      total_estimate > 1e9 ||
      !Array.isArray(parts_list) ||
      parts_list.length > 30 ||
      parts_list.some(
        (part: unknown) => typeof part !== "string" || part.length > 500,
      )
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
    return internalError("parts", err);
  }
}
