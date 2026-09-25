export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { getDealerCalibration } from "@/lib/scoring/calibration";
import { getUserPlan, isPaid } from "@/lib/auth/plan";

// /api/calibration — the dealer's learned multipliers from their logged outcomes. Null until they
// have logged enough deals (the engine won't bend estimates on thin data). Pro feature when gating
// is enabled — free dealers can still LOG outcomes, but personalized calibration is paid.
export async function GET() {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id) return NextResponse.json({ calibration: null });

  const supabase = createServerComponentClient();

  if (process.env.GATING_ENABLED === "true") {
    const plan = await getUserPlan(supabase, user.id);
    if (!isPaid(plan)) {
      return NextResponse.json({
        calibration: null,
        locked: true,
        feature: "calibration",
        plan,
      });
    }
  }

  const calibration = await getDealerCalibration(supabase, user.id);
  return NextResponse.json({ calibration });
}
