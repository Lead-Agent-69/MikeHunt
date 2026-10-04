import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/server-supabase";
import { PremiumLandingPage } from "@/components/landing/PremiumLandingPage";

export const metadata = {
  title: "MikeHunt — Listings workspace",
  description:
    "MikeHunt is a workspace for car listings. The public home is not a live scan and does not show sold comps or profit until sources are connected.",
};

export default async function Home() {
  let dest: string | null = null;
  try {
    const {
      data: { user },
    } = await getServerUser();
    if (user) dest = "/discover";
  } catch {
    // Not configured or no session — show the public landing.
  }
  if (dest) redirect(dest);

  return <PremiumLandingPage />;
}
