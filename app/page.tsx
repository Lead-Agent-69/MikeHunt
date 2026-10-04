import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/server-supabase";
import { PremiumLandingPage } from "@/components/landing/PremiumLandingPage";

export const metadata = {
  title: "MIKEHUNT — Vehicle acquisition, made clear",
  description:
    "MIKEHUNT is a vehicle acquisition workspace for reviewing evidence, all-in costs, and next steps before you buy.",
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
