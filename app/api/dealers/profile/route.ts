import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getServerUser } from "@/lib/server-supabase";

async function getSupabaseAuth(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await getServerUser();
  return { supabase, user, supabaseResponse };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseAuth(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get dealer profile (a dealer's id IS the auth user id).
    const { data: dealer, error } = await supabase
      .from("dealers")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching dealer profile:", error);
      return NextResponse.json(
        { error: "Failed to fetch profile" },
        { status: 500 },
      );
    }

    // If no profile exists, return null (user needs to complete onboarding)
    if (!dealer) {
      return NextResponse.json({ dealer: null });
    }

    return NextResponse.json({ dealer });
  } catch (error) {
    console.error("Error in dealer profile API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseAuth(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      dealership_name,
      home_state,
      default_auction_fee,
      default_recon_cost,
      default_floor_rate,
      target_profit,
    } = body;

    // Map incoming body to REAL `dealers` columns.
    const profileFields = {
      name: dealership_name,
      home_state,
      auction_fee_default: default_auction_fee,
      recon_cost_default: default_recon_cost,
      daily_floor_rate: default_floor_rate,
      target_profit,
    };

    // Check if dealer profile already exists (dealer.id === auth user id).
    const { data: existing } = await supabase
      .from("dealers")
      .select("id")
      .eq("id", user.id)
      .single();

    if (existing) {
      // Update existing profile
      const { data: dealer, error } = await supabase
        .from("dealers")
        .update(profileFields)
        .eq("id", user.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating dealer profile:", error);
        return NextResponse.json(
          { error: "Failed to update profile" },
          { status: 500 },
        );
      }

      return NextResponse.json({ dealer });
    } else {
      // Create new profile (id IS the auth user id).
      const { data: dealer, error } = await supabase
        .from("dealers")
        .insert({
          id: user.id,
          ...profileFields,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating dealer profile:", error);
        return NextResponse.json(
          { error: "Failed to create profile" },
          { status: 500 },
        );
      }

      return NextResponse.json({ dealer });
    }
  } catch (error) {
    console.error("Error in dealer profile API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
