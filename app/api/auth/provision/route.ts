import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Initialize Supabase admin client to bypass RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 0. Create Auth User securely and instantly confirm email
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      console.error("Failed to create auth user:", authError);
      return NextResponse.json(
        { error: authError?.message || "Failed to create user" },
        { status: 500 },
      );
    }

    const userId = authData.user.id;

    // 1. Provision profile
    const { error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .upsert(
        {
          id: userId,
          name: fullName,
          auction_fee_default: 450.0,
          recon_cost_default: 500.0,
          daily_floor_rate: 35.0,
          target_profit: 3500.0,
        },
        { onConflict: "id" },
      );

    if (profileError) {
      console.error("Failed to provision profile:", profileError);
      // Cleanup the auth user since profile failed
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: profileError }, { status: 500 });
    }

    // 2. Provision dealer
    const { error: dealerError } = await supabaseAdmin.from("dealers").upsert(
      {
        id: userId,
        name: fullName || email.split("@")[0],
        slug: userId, // use ID as slug initially
        type: "independent",
        city: "Unknown",
        state: "XX",
        lat: 0,
        lng: 0,
      },
      { onConflict: "id" },
    );

    if (dealerError) {
      console.error("Failed to provision dealer:", dealerError);
      // Cleanup
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: dealerError }, { status: 500 });
    }

    return NextResponse.json({ success: true, userId });
  } catch (err: any) {
    console.error("Provisioning error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
