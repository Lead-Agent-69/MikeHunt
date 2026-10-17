import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      error:
        "Bulk sourcing has been retired. Use car search and saved searches.",
      replacement: "/market",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
