"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Mono } from "@/components/shared/Mono";

// useSearchParams() must sit under a Suspense boundary or static prerender bails out and the build fails.
export default function BetaSuccessPage() {
  return (
    <Suspense fallback={null}>
      <BetaSuccessInner />
    </Suspense>
  );
}

function BetaSuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [countdown, setCountdown] = useState(5);

  // Countdown to redirect
  useEffect(() => {
    if (countdown === 0) {
      router.push("/scan");
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, router]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--s0)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-2xl w-full"
      >
        <div className="glass-panel p-8 text-center">
          {/* Success Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
            style={{ background: "var(--grad)" }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="black"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </motion.div>

          {/* Success Message */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl font-black text-[var(--t1)] mb-4"
          >
            Welcome to DealerHunt Pro! 🎉
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-lg text-[var(--t2)] mb-8"
          >
            Your beta access is now active. You're one of the first 500 dealers
            to get early access.
          </motion.p>

          {/* What's Next */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-panel p-6 mb-8 text-left"
          >
            <h2 className="text-xl font-bold text-[var(--t1)] mb-4">
              What's Included in Your Beta Pass:
            </h2>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: "var(--amber-lo)" }}
                >
                  <span className="text-sm">✓</span>
                </div>
                <div>
                  <div className="font-semibold text-[var(--t1)]">
                    Unlimited Deal Search
                  </div>
                  <div className="text-sm text-[var(--t3)]">
                    Browse 1,000+ profitable deals updated daily
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: "var(--amber-lo)" }}
                >
                  <span className="text-sm">✓</span>
                </div>
                <div>
                  <div className="font-semibold text-[var(--t1)]">
                    Max Bid Calculator
                  </div>
                  <div className="text-sm text-[var(--t3)]">
                    Know exactly what to pay to hit your ROI target
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: "var(--amber-lo)" }}
                >
                  <span className="text-sm">✓</span>
                </div>
                <div>
                  <div className="font-semibold text-[var(--t1)]">
                    Outcome Tracking
                  </div>
                  <div className="text-sm text-[var(--t3)]">
                    Log your deals to get personalized profit predictions
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: "var(--amber-lo)" }}
                >
                  <span className="text-sm">✓</span>
                </div>
                <div>
                  <div className="font-semibold text-[var(--t1)]">
                    Saved Searches & Alerts
                  </div>
                  <div className="text-sm text-[var(--t3)]">
                    Get notified when profitable deals match your criteria
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: "var(--amber-lo)" }}
                >
                  <span className="text-sm">✓</span>
                </div>
                <div>
                  <div className="font-semibold text-[var(--t1)]">
                    Lifetime 20% Discount
                  </div>
                  <div className="text-sm text-[var(--t3)]">
                    After trial: $23/month forever (vs $29 regular price)
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Trial Details */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="p-4 rounded-[var(--r2)] mb-8"
            style={{ background: "var(--s2)" }}
          >
            <div className="text-sm text-[var(--t3)] mb-2">
              Your 30-Day Trial Details
            </div>
            <div className="flex items-baseline justify-center gap-2">
              <Mono className="text-3xl font-black text-[var(--t1)]">$1</Mono>
              <span className="text-[var(--t3)]">for the first 30 days</span>
            </div>
            <div className="text-sm text-[var(--t3)] mt-2">
              Then $23/month • Cancel anytime
            </div>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <button
              onClick={() => router.push("/scan")}
              className="w-full py-4 rounded-[var(--r3)] text-xl font-black text-black mb-4 hover:scale-105 transition-transform"
              style={{ background: "var(--grad)" }}
            >
              Start Finding Deals →
            </button>

            <div className="text-sm text-[var(--t4)]">
              Redirecting in {countdown} second{countdown !== 1 ? "s" : ""}...
            </div>
          </motion.div>

          {/* Next Steps */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-8 pt-6 border-t"
            style={{ borderColor: "var(--b2)" }}
          >
            <h3 className="text-lg font-bold text-[var(--t1)] mb-3">
              Pro Tips for Getting Started:
            </h3>

            <div className="text-sm text-[var(--t3)] text-left space-y-2">
              <div>
                1.{" "}
                <strong className="text-[var(--t2)]">Browse the deals</strong>{" "}
                to see what's available in your area
              </div>
              <div>
                2. <strong className="text-[var(--t2)]">Save a search</strong>{" "}
                to get alerts when new deals match your criteria
              </div>
              <div>
                3.{" "}
                <strong className="text-[var(--t2)]">
                  Log your first outcome
                </strong>{" "}
                to start building personalized predictions
              </div>
              <div>
                4. <strong className="text-[var(--t2)]">Check daily</strong> for
                fresh inventory - deals move fast!
              </div>
            </div>
          </motion.div>

          {/* Support */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="mt-8 text-sm text-[var(--t4)]"
          >
            <p>
              Questions? Email us at{" "}
              <a
                href="mailto:support@dealerhunt.pro"
                className="text-[var(--amber)] hover:underline"
              >
                support@dealerhunt.pro
              </a>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
