export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { getDealerCalibration } from "@/lib/scoring/calibration";

// /api/calibration — the dealer's learned multipliers from their logged outcomes. Null until they
// have logged enough deals (the engine won't bend estimates on thin data). No payment required.
export async function GET() {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id) return NextResponse.json({ calibration: null });

  const supabase = createServerComponentClient();

  const calibration = await getDealerCalibration(supabase, user.id);
  return NextResponse.json({ calibration });
}
