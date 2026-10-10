import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
// Legacy checkout must not create charges under the free customer-access policy.
export async function POST() {
  return NextResponse.json(
    {
      error: "Customer upgrades are free. Choose your workspace instead.",
      upgradeUrl: "/upgrade",
    },
    { status: 410 },
  );
}
