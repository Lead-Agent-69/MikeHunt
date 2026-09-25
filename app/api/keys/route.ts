export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { generateApiKey } from "@/lib/api-keys";

// /api/keys — manage a dealer's public-API keys. POST mints one (plaintext shown once); GET lists.
export async function GET() {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerComponentClient();
  const { data } = await supabase
    .from("api_keys")
    .select(
      "id, name, key_prefix, request_count, last_used_at, revoked, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ keys: data || [] });
}

export async function POST(req: NextRequest) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let name = "API key";
  try {
    const b = await req.json();
    if (b?.name) name = String(b.name).slice(0, 60);
  } catch {}

  const { raw, hash, prefix } = generateApiKey();
  const supabase = createServerComponentClient();
  const { error } = await supabase
    .from("api_keys")
    .insert({ user_id: user.id, name, key_hash: hash, key_prefix: prefix });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  // The ONLY time the plaintext is returned.
  return NextResponse.json({ key: raw, prefix, name });
}
