import { NextResponse } from "next/server";

// Retained as an explicit tombstone for older clients. Public requests must never
// receive service-role user creation; registration now uses Supabase Auth signup.
export async function POST() {
  return NextResponse.json(
    { error: "Use Supabase signup and authenticated account bootstrap." },
    { status: 410 },
  );
}
