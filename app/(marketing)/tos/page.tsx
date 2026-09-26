import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | MikeHunt",
  description:
    "MikeHunt Terms of Service — the rules that govern your use of our dealer intelligence platform.",
};

export default function TermsOfService() {
  const LAST_UPDATED = "September 26, 2026";

  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-[var(--t2)]">
      <h1 className="text-4xl font-black text-[var(--t1)] mb-2">
        Terms of Service
      </h1>
      <p className="text-sm text-[var(--t4)] mb-10">Last updated: {LAST_UPDATED}</p>

      <section className="space-y-8 leading-relaxed">
        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">1. Acceptance of Terms</h2>
          <p>
            By accessing or using MikeHunt (&ldquo;the Service&rdquo;), you agree to be bound by
            these Terms of Service. If you do not agree to these terms, do not use the Service.
            The Service is intended for licensed auto dealers and industry professionals only.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">2. Description of Service</h2>
          <p>
            MikeHunt provides AI-powered vehicle deal intelligence, market valuation data,
            profit analysis, and related tools to help automotive dealers identify and evaluate
            buying opportunities. All valuations, scores, and recommendations are estimates only
            and should not be treated as financial advice.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">3. User Accounts</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials
            and for all activities that occur under your account. You must notify us immediately
            of any unauthorized use of your account. We reserve the right to terminate accounts
            that violate these terms.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">4. Subscription &amp; Billing</h2>
          <p>
            Paid plans are billed on a monthly or annual basis. Subscriptions automatically
            renew unless cancelled before the renewal date. Refunds are not provided for partial
            billing periods. We reserve the right to change pricing with 30 days&rsquo; notice.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">5. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--t3)]">
            <li>Use the Service for any unlawful purpose</li>
            <li>Scrape, copy, or redistribute our data without written permission</li>
            <li>Attempt to reverse-engineer or circumvent security measures</li>
            <li>Use automated bots or scrapers against the platform</li>
            <li>Share account access with unauthorized third parties</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">6. Data &amp; Valuations Disclaimer</h2>
          <p>
            All deal scores, profit estimates, sell estimates, and valuations are provided for
            informational purposes only. They are derived from market data and algorithmic
            analysis and may not reflect actual transaction prices. MikeHunt makes no
            guarantees regarding the accuracy of any valuation. You are solely responsible
            for all purchasing decisions made using the Service.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">7. Intellectual Property</h2>
          <p>
            All content, algorithms, and platform features are the exclusive property of
            MikeHunt and its licensors. You are granted a limited, non-exclusive,
            non-transferable license to use the Service for your internal business purposes only.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">8. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, MikeHunt shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages, including loss
            of profits, arising from your use of the Service. Our total liability shall not
            exceed the amount paid by you in the 12 months preceding the claim.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">9. Termination</h2>
          <p>
            We may terminate or suspend your account at any time for violation of these terms.
            Upon termination, your right to use the Service will immediately cease. You may
            cancel your subscription at any time from your account settings.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">10. Changes to Terms</h2>
          <p>
            We reserve the right to modify these terms at any time. We will notify you of
            material changes via email or in-app notification. Continued use of the Service
            after changes constitutes acceptance of the new terms.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">11. Governing Law</h2>
          <p>
            These terms are governed by the laws of the State of Delaware, United States,
            without regard to conflict of law principles. Any disputes shall be resolved
            through binding arbitration in accordance with the AAA Commercial Arbitration Rules.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">12. Contact</h2>
          <p>
            Questions about these terms? Contact us at{" "}
            <a
              href="mailto:legal@mikehunt.app"
              className="text-[var(--amber)] hover:underline"
            >
              legal@mikehunt.app
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
