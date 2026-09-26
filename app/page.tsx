import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/server-supabase";
import { PremiumLandingPage } from "@/components/landing/PremiumLandingPage";

export const metadata = {
  title: "MikeHunt — Underpriced cars, deal-scored",
  description:
    "MikeHunt finds underpriced cars across every auction, marketplace, and dealer lot — each priced against the live market so you know exactly what to pay before you bid.",
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
