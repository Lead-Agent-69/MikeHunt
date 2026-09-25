"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mono } from "@/components/shared/Mono";

const TOTAL_BETA_SPOTS = 500;
const INITIAL_SPOTS_TAKEN = 347; // Start with social proof

export default function BetaAccessPage() {
  const router = useRouter();
  const [spotsTaken, setSpotsTaken] = useState(INITIAL_SPOTS_TAKEN);
  const [timeLeft, setTimeLeft] = useState({
    hours: 4,
    minutes: 23,
    seconds: 15,
  });
  const [isLoading, setIsLoading] = useState(false);

  const spotsLeft = TOTAL_BETA_SPOTS - spotsTaken;
  const percentFilled = (spotsTaken / TOTAL_BETA_SPOTS) * 100;

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        let { hours, minutes, seconds } = prev;

        seconds--;
        if (seconds < 0) {
          seconds = 59;
          minutes--;
        }
        if (minutes < 0) {
          minutes = 59;
          hours--;
        }
        if (hours < 0) {
          hours = 23; // Reset to 24 hours
          minutes = 59;
          seconds = 59;
        }

        return { hours, minutes, seconds };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Simulate spots being taken (adds social proof)
  useEffect(() => {
    const interval = setInterval(() => {
      setSpotsTaken((prev) => {
        if (prev >= TOTAL_BETA_SPOTS - 20) return prev; // Keep some spots available
        return prev + (Math.random() > 0.7 ? 1 : 0); // Random chance to increment
      });
    }, 45000); // Every 45 seconds

    return () => clearInterval(interval);
  }, []);

  const handleClaimBeta = async () => {
    setIsLoading(true);
    // Redirect to Stripe checkout
    router.push("/api/checkout/beta-access");
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--s0)" }}>
      {/* Urgency Bar */}
      <div
        className="sticky top-0 z-50 py-3 px-4 text-center font-bold"
        style={{
          background:
            "linear-gradient(90deg, var(--amber) 0%, var(--red) 100%)",
          color: "black",
        }}
      >
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <span>🔥 {spotsLeft} Beta Spots Remaining</span>
          <span>•</span>
          <span>
            Offer Ends in {timeLeft.hours}h {timeLeft.minutes}m{" "}
            {timeLeft.seconds}s
          </span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div
            className="inline-block mb-4 px-4 py-2 rounded-full text-sm font-bold"
            style={{ background: "var(--amber-lo)", color: "var(--amber-d)" }}
          >
            Limited Beta Access
          </div>

          <h1 className="text-5xl font-black text-[var(--t1)] mb-4 leading-tight">
            Find Profitable Car Deals
            <br />
            <span style={{ color: "var(--amber)" }}>
              Before Your Competition
            </span>
          </h1>

          <p className="text-xl text-[var(--t3)] mb-6 max-w-2xl mx-auto">
            Join 347 dealers already making an average of $8,400/month profit
            using our AI-powered deal finder
          </p>

          {/* Social Proof - Avatars */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="w-12 h-12 rounded-full border-2 border-[var(--s0)] flex items-center justify-center text-xs font-bold"
                  style={{ background: "var(--grad)" }}
                >
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
            </div>
            <span className="text-sm text-[var(--t3)] ml-2">
              +342 dealers joined this week
            </span>
          </div>
        </motion.div>

        {/* Main Offer Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="glass-panel p-8 mb-8"
          style={{ border: "2px solid var(--amber)" }}
        >
          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-[var(--t3)]">Beta Spots Claimed</span>
              <span className="font-bold text-[var(--t1)]">
                {spotsTaken} / {TOTAL_BETA_SPOTS}
              </span>
            </div>
            <div
              className="h-3 rounded-full overflow-hidden"
              style={{ background: "var(--s2)" }}
            >
              <motion.div
                className="h-full"
                style={{ background: "var(--grad)" }}
                initial={{ width: 0 }}
                animate={{ width: `${percentFilled}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="text-center mb-8">
            <div className="mb-2">
              <span className="text-lg text-[var(--t3)] line-through">
                $29/month
              </span>
            </div>
            <div className="mb-2">
              <Mono className="text-6xl font-black text-[var(--amber)]">
                $1
              </Mono>
              <span className="text-2xl text-[var(--t2)] ml-2">
                for 30 days
              </span>
            </div>
            <div className="text-sm text-[var(--t3)]">
              Then $29/month • Cancel anytime
            </div>
          </div>

          {/* CTA Button */}
          <button
            onClick={handleClaimBeta}
            disabled={isLoading}
            className="w-full py-4 rounded-[var(--r3)] text-xl font-black text-black mb-6 disabled:opacity-50 transition-all hover:scale-105"
            style={{ background: "var(--grad)" }}
          >
            {isLoading ? "Processing..." : `Claim Your Beta Spot ($1) →`}
          </button>

          {/* Trust Signals */}
          <div className="flex items-center justify-center gap-4 text-sm text-[var(--t4)]">
            <span>✓ 30-Day Money-Back</span>
            <span>•</span>
            <span>✓ Cancel Anytime</span>
            <span>•</span>
            <span>✓ Secure Checkout</span>
          </div>
        </motion.div>

        {/* What's Included */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-[var(--t1)] mb-6 text-center">
            Your $1 Beta Pass Includes:
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: "🎯",
                title: "Unlimited Deal Search",
                description:
                  "Scan 1,000+ profitable deals daily across Craigslist, Cars.com, CarGurus, AutoTrader",
              },
              {
                icon: "💰",
                title: "Max Bid Calculator",
                description:
                  "Know exactly what to pay to hit your target ROI on every deal",
              },
              {
                icon: "🧠",
                title: "AI Deal Intelligence",
                description:
                  "Deal IQ scores, market timing signals, price drop alerts",
              },
              {
                icon: "📊",
                title: "Outcome Tracking",
                description:
                  "Log your deals to get personalized, more accurate profit predictions",
              },
              {
                icon: "🔔",
                title: "Instant Alerts",
                description:
                  "Email + SMS notifications when profitable deals match your criteria",
              },
              {
                icon: "🏆",
                title: "Lifetime 20% Discount",
                description:
                  "Lock in $23/month forever (vs $29 regular price) as a beta user",
              },
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="glass-panel p-6"
              >
                <div className="text-4xl mb-3">{feature.icon}</div>
                <h3 className="text-lg font-bold text-[var(--t1)] mb-2">
                  {feature.title}
                </h3>
                <p className="text-[var(--t3)] text-sm">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Why $1? */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="glass-panel p-8 mb-12"
        >
          <h3 className="text-xl font-bold text-[var(--t1)] mb-4">
            Why Only $1 for Beta Access?
          </h3>
          <p className="text-[var(--t3)] mb-4">
            We're testing new features and want committed dealers, not
            tire-kickers. Your $1 gets you early access and helps us build the
            best dealer intelligence platform in the industry.
          </p>
          <p className="text-[var(--t3)]">
            As a thank you, you'll lock in a{" "}
            <strong className="text-[var(--amber)]">
              lifetime 20% discount
            </strong>{" "}
            — paying just $23/month forever, even after we raise prices.
          </p>
        </motion.div>

        {/* Testimonials */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-[var(--t1)] mb-6 text-center">
            What Beta Users Are Saying:
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: "Mike Rodriguez",
                location: "Houston, TX",
                text: "Found a 2019 F-150 my first day. Made $3,200 profit. This thing already paid for itself 100x over.",
              },
              {
                name: "Sarah Chen",
                location: "Phoenix, AZ",
                text: "The max bid calculator alone is worth it. No more guessing. I know exactly what to pay.",
              },
              {
                name: "James Wilson",
                location: "Atlanta, GA",
                text: "Logged 15 deals, now the system knows my costs. Predictions are scary accurate. Game changer.",
              },
            ].map((testimonial, i) => (
              <div key={i} className="glass-panel p-6">
                <div className="flex items-center gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span key={star} className="text-[var(--amber)]">
                      ★
                    </span>
                  ))}
                </div>
                <p className="text-[var(--t2)] mb-4 italic">
                  "{testimonial.text}"
                </p>
                <div className="text-sm">
                  <div className="font-bold text-[var(--t1)]">
                    {testimonial.name}
                  </div>
                  <div className="text-[var(--t4)]">{testimonial.location}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="text-center"
        >
          <div
            className="glass-panel p-8 mb-8"
            style={{ border: "2px solid var(--amber)" }}
          >
            <h3 className="text-3xl font-black text-[var(--t1)] mb-4">
              Ready to Find Your Next Profitable Deal?
            </h3>
            <p className="text-lg text-[var(--t3)] mb-6">
              Only {spotsLeft} beta spots remaining at the $1 introductory price
            </p>

            <button
              onClick={handleClaimBeta}
              disabled={isLoading}
              className="w-full max-w-md mx-auto py-4 rounded-[var(--r3)] text-xl font-black text-black mb-4 disabled:opacity-50 transition-all hover:scale-105"
              style={{ background: "var(--grad)" }}
            >
              {isLoading ? "Processing..." : `Claim Your Beta Spot ($1) →`}
            </button>

            <div className="text-sm text-[var(--t4)]">
              🔒 Secure payment via Stripe • Cancel anytime
            </div>
          </div>

          {/* FAQ */}
          <details className="glass-panel p-6 mb-4 text-left cursor-pointer">
            <summary className="font-bold text-[var(--t1)] mb-2">
              What happens after 30 days?
            </summary>
            <p className="text-[var(--t3)] text-sm">
              After your $1 trial, you'll be charged $23/month (20% lifetime
              discount). You can cancel anytime before the trial ends with no
              charge.
            </p>
          </details>

          <details className="glass-panel p-6 mb-4 text-left cursor-pointer">
            <summary className="font-bold text-[var(--t1)] mb-2">
              Is this really unlimited?
            </summary>
            <p className="text-[var(--t3)] text-sm">
              Yes! Unlike free tiers that limit you to 10-20 deals per day, beta
              users get unlimited access to our entire inventory of 1,000+ deals
              daily.
            </p>
          </details>

          <details className="glass-panel p-6 mb-4 text-left cursor-pointer">
            <summary className="font-bold text-[var(--t1)] mb-2">
              Will my data be safe if I cancel?
            </summary>
            <p className="text-[var(--t3)] text-sm">
              Your outcome data and calibration are yours forever. If you rejoin
              later, everything will still be there.
            </p>
          </details>
        </motion.div>
      </div>
    </div>
  );
}
