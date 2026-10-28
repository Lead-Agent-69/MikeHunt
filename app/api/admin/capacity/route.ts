import { NextRequest, NextResponse } from "next/server";
import { canManageOperations } from "@/lib/auth/admin-operations";
import { createServerComponentClient } from "@/lib/supabase";
import { inventoryCapacity } from "@/lib/admin/inventory-capacity";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  if (!(await canManageOperations(request)))
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );
  try {
    const { data, error } = await createServerComponentClient()
      .rpc("inventory_capacity_report")
      .abortSignal(AbortSignal.timeout(12_000));
    const report = error ? null : inventoryCapacity(data);
    if (!report) throw new Error("Unverified capacity report");
    return NextResponse.json(report, { headers });
  } catch {
    return NextResponse.json(
      {
        error:
          "Capacity information is temporarily unavailable. Retry the check.",
      },
      { status: 503, headers },
    );
  }
}
