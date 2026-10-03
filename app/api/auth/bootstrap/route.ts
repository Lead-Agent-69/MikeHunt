import { NextRequest, NextResponse } from "next/server";
import { ensureAccountRows } from "@/lib/auth/account-bootstrap";
import { getServerUser } from "@/lib/server-supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let fullName: string | undefined;
  try {
    const body = await request.json();
    if (typeof body?.fullName === "string") fullName = body.fullName;
  } catch {
    // The body is optional; OAuth callbacks normally rely on provider metadata.
  }

  try {
    const account = await ensureAccountRows(user, fullName);
    return NextResponse.json({ success: true, ...account });
  } catch (error: any) {
    console.error("Account bootstrap failed:", error);
    return NextResponse.json(
      { error: "Account setup could not be completed." },
      { status: 500 },
    );
  }
}
