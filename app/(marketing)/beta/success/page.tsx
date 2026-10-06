"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

// After early-access signup, continue to the app. /discover sends anyone who has not finished
// setup to /onboarding (middleware), so this lands new testers on setup and onboarded ones on
// Discover. No price or seat claims here: the page does not know what was charged.
const BETA_NEXT_PATH = "/discover";

export default function BetaSuccessPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (countdown === 0) {
      router.push(BETA_NEXT_PATH);
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, router]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--s0)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-xl w-full"
      >
        <div className="glass-panel p-8 text-center">
          <h1 className="text-3xl font-black text-[var(--t1)] mb-3">
            You&apos;re in early access
          </h1>
          <p className="text-[var(--t2)] mb-6">
            Next, tell us what you&apos;re buying for and where you live so your
            listings start in the right place.
          </p>

          <button
            onClick={() => router.push(BETA_NEXT_PATH)}
            className="w-full py-4 rounded-[var(--r3)] text-lg font-black text-black mb-3"
            style={{ background: "var(--grad)" }}
          >
            Continue
          </button>
          <div className="text-sm text-[var(--t4)]">
            Continuing in {countdown} second{countdown !== 1 ? "s" : ""}...
          </div>

          <p className="mt-8 text-sm text-[var(--t4)]">
            Questions or a listing that looks wrong? Email{" "}
            <a
              href="mailto:support@MikeHunt.pro"
              className="text-[var(--amber)] hover:underline"
            >
              support@MikeHunt.pro
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
