import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { error: "The finance tool has been retired.", replacement: "/fleet" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = GET;
