import { createServerComponentClient } from "@/lib/supabase";

interface AccountIdentity {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

function displayName(user: AccountIdentity, requestedName?: string) {
  const metadataName =
    user.user_metadata?.full_name || user.user_metadata?.name;
  const emailName = user.email?.split("@")[0];
  return String(requestedName || metadataName || emailName || "MikeHunt buyer")
    .trim()
    .slice(0, 120);
}

export async function ensureAccountRows(
  user: AccountIdentity,
  requestedName?: string,
) {
  const admin = createServerComponentClient();
  const name = displayName(user, requestedName);

  const { data: existingProfile, error: existingProfileError } = await admin
    .from("user_profiles")
    .select("onboarded")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfileError) throw existingProfileError;

  const [profileResult, dealerResult] = await Promise.all([
    admin.from("user_profiles").upsert(
      {
        id: user.id,
        name,
        auction_fee_default: 450,
        recon_cost_default: 500,
        daily_floor_rate: 35,
        target_profit: 3500,
      },
      { onConflict: "id", ignoreDuplicates: true },
    ),
    admin.from("dealers").upsert(
      {
        id: user.id,
        name,
        slug: user.id,
        type: "independent",
        city: "Unknown",
        state: "XX",
        lat: 0,
        lng: 0,
      },
      { onConflict: "id", ignoreDuplicates: true },
    ),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (dealerResult.error) throw dealerResult.error;
  return {
    userId: user.id,
    name,
    onboarded: existingProfile?.onboarded === true,
  };
}
