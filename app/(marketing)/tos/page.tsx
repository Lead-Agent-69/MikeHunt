import React from "react";
import type { Metadata } from "next";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Ico } from "@/components/shared/Ico";

export const metadata: Metadata = {
  title: "Terms of Service | MikeHunt",
  description:
    "MikeHunt Terms of Service — the rules that govern your use of our dealer intelligence platform.",
};

export default function TermsOfService() {
  const LAST_UPDATED = "September 28, 2026";

  return (
    <PublicLayout
      title="Terms of Service"
      description="The rules that govern your use of our dealer intelligence platform."
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="glass-panel p-8 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: "var(--grad)" }}
            >
              <Ico name="shield" size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm text-[var(--t4)]">Last updated</p>
              <p className="text-lg font-bold text-[var(--t1)]">{LAST_UPDATED}</p>
            </div>
          </div>
          <p className="text-[var(--t3)]">
            Please read these terms carefully before using MikeHunt. By accessing or using our service, you agree to be bound by these terms.
          </p>
        </div>

        <div className="space-y-8">
          {[
            {
              title: "1. Acceptance of Terms",
              icon: "check-circle",
              content: (
                <p className="text-[var(--t3)]">
                  By accessing or using MikeHunt ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service. The Service is intended for licensed auto dealers and industry professionals only.
                </p>
              ),
            },
            {
              title: "2. Description of Service",
              icon: "car",
              content: (
                <p className="text-[var(--t3)]">
                  MikeHunt provides AI-powered vehicle deal intelligence, market valuation data, profit analysis, and related tools to help automotive dealers identify and evaluate buying opportunities. All valuations, scores, and recommendations are estimates only and should not be treated as financial advice.
                </p>
              ),
            },
            {
              title: "3. User Accounts",
              icon: "users",
              content: (
                <p className="text-[var(--t3)]">
                  You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorized use of your account. We reserve the right to terminate accounts that violate these terms.
                </p>
              ),
            },
            {
              title: "4. Subscription & Billing",
              icon: "dollar",
              content: (
                <p className="text-[var(--t3)]">
                  Paid plans are billed on a monthly or annual basis. Subscriptions automatically renew unless cancelled before the renewal date. Refunds are not provided for partial billing periods. We reserve the right to change pricing with 30 days' notice.
                </p>
              ),
            },
            {
              title: "5. Acceptable Use",
              icon: "alert-triangle",
              content: (
                <div>
                  <p className="mb-4">You agree not to:</p>
                  <ul className="space-y-2">
                    {[
                      "Use the Service for any unlawful purpose",
                      "Scrape, copy, or redistribute our data without written permission",
                      "Attempt to reverse-engineer or circumvent security measures",
                      "Use automated bots or scrapers against the platform",
                      "Share account access with unauthorized third parties",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[var(--t3)]">
                        <Ico name="x" size={16} className="shrink-0 mt-0.5 text-[var(--red)]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            },
            {
              title: "6. Data & Valuations Disclaimer",
              icon: "calculator",
              content: (
                <p className="text-[var(--t3)]">
                  All deal scores, profit estimates, sell estimates, and valuations are provided for informational purposes only. They are derived from market data and algorithmic analysis and may not reflect actual transaction prices. MikeHunt makes no guarantees regarding the accuracy of any valuation. You are solely responsible for all purchasing decisions made using the Service.
                </p>
              ),
            },
            {
              title: "7. Intellectual Property",
              icon: "shield",
              content: (
                <p className="text-[var(--t3)]">
                  All content, algorithms, and platform features are the exclusive property of MikeHunt and its licensors. You are granted a limited, non-exclusive, non-transferable license to use the Service for your internal business purposes only.
                </p>
              ),
            },
            {
              title: "8. Limitation of Liability",
              icon: "alert-triangle",
              content: (
                <p className="text-[var(--t3)]">
                  To the maximum extent permitted by law, MikeHunt shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, arising from your use of the Service. Our total liability shall not exceed the amount paid by you in the 12 months preceding the claim.
                </p>
              ),
            },
            {
              title: "9. Termination",
              icon: "x",
              content: (
                <p className="text-[var(--t3)]">
                  We may terminate or suspend your account at any time for violation of these terms. Upon termination, your right to use the Service will immediately cease. You may cancel your subscription at any time from your account settings.
                </p>
              ),
            },
            {
              title: "10. Changes to Terms",
              icon: "refresh",
              content: (
                <p className="text-[var(--t3)]">
                  We reserve the right to modify these terms at any time. We will notify you of material changes via email or in-app notification. Continued use of the Service after changes constitutes acceptance of the new terms.
                </p>
              ),
            },
            {
              title: "11. Governing Law",
              icon: "map",
              content: (
                <p className="text-[var(--t3)]">
                  These terms are governed by the laws of the State of Delaware, United States, without regard to conflict of law principles. Any disputes shall be resolved through binding arbitration in accordance with the AAA Commercial Arbitration Rules.
                </p>
              ),
            },
            {
              title: "12. Contact",
              icon: "mail",
              content: (
                <p className="text-[var(--t3)]">
                  Questions about these terms? Contact us at{" "}
                  <a
                    href="mailto:legal@mikehunt.app"
                    className="text-[var(--amber)] underline underline-offset-2"
                  >
                    legal@mikehunt.app
                  </a>
                </p>
              ),
            },
          ].map((section) => (
            <div key={section.title} className="glass-panel p-6">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: "var(--grad)" }}
                >
                  <Ico name={section.icon as any} size={20} className="text-white" />
                </div>
                <h2 className="text-xl font-bold text-[var(--t1)]">{section.title}</h2>
              </div>
              <div className="text-[var(--t3)] leading-relaxed">{section.content}</div>
            </div>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}
