import React from "react";
import type { Metadata } from "next";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Ico } from "@/components/shared/Ico";

export const metadata: Metadata = {
  title: "Privacy Policy | MikeHunt",
  description:
    "MikeHunt Privacy Policy — how we collect, use, and protect your data.",
};

export default function PrivacyPolicy() {
  const LAST_UPDATED = "September 28, 2026";

  return (
    <PublicLayout
      title="Privacy Policy"
      description="Learn how we collect, use, and protect your personal information."
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
            Your privacy is important to us. This policy explains how we collect, use, and protect your personal information when you use MikeHunt.
          </p>
        </div>

        <div className="space-y-8">
          {[
            {
              title: "1. Information We Collect",
              icon: "database",
              content: (
                <div>
                  <p className="mb-4">We collect the following types of information:</p>
                  <ul className="space-y-3">
                    {[
                      { strong: "Account information", text: "Name, email address, dealership name, and location when you create an account." },
                      { strong: "Usage data", text: "Deal views, search queries, saved searches, and feature interactions to improve the platform." },
                      { strong: "Outcome data", text: "Vehicle purchase and sale outcomes you voluntarily submit to improve valuation accuracy." },
                      { strong: "Payment information", text: "Processed securely by Stripe. We do not store your card details." },
                      { strong: "Device & browser data", text: "IP address, browser type, and device information for security and analytics." },
                    ].map((item) => (
                      <li key={item.strong} className="flex gap-2">
                        <span className="font-semibold text-[var(--t2)]">{item.strong}:</span>
                        <span className="text-[var(--t3)]">{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            },
            {
              title: "2. How We Use Your Information",
              icon: "settings",
              content: (
                <ul className="space-y-2">
                  {[
                    "To provide, maintain, and improve the Service",
                    "To personalize deal recommendations to your market and preferences",
                    "To calibrate valuation accuracy based on your logged outcomes",
                    "To send deal alerts and notifications you've opted into",
                    "To process billing and manage your subscription",
                    "To detect and prevent fraud and security threats",
                    "To comply with legal obligations",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[var(--t3)]">
                      <Ico name="check" size={16} className="shrink-0 mt-0.5 text-[var(--green)]" />
                      {item}
                    </li>
                  ))}
                </ul>
              ),
            },
            {
              title: "3. Data Sharing",
              icon: "share",
              content: (
                <div>
                  <p className="mb-4">We do not sell your personal data. We may share data with:</p>
                  <ul className="space-y-3">
                    {[
                      { strong: "Service providers", text: "Supabase (database), Stripe (payments), Resend (email), Vercel (hosting) — all under data processing agreements." },
                      { strong: "Aggregated market data", text: "Anonymized, non-identifiable outcome data may be used to improve platform-wide valuation models." },
                      { strong: "Legal requirements", text: "When required by law or to protect the rights and safety of our users." },
                    ].map((item) => (
                      <li key={item.strong} className="flex gap-2">
                        <span className="font-semibold text-[var(--t2)]">{item.strong}:</span>
                        <span className="text-[var(--t3)]">{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            },
            {
              title: "4. Data Retention",
              icon: "clock",
              content: (
                <p className="text-[var(--t3)]">
                  We retain your account data for as long as your account is active or as needed to provide the Service. Outcome and transaction data used for model training is retained in anonymized form indefinitely. You may request deletion of your personal data at any time.
                </p>
              ),
            },
            {
              title: "5. Security",
              icon: "shield",
              content: (
                <p className="text-[var(--t3)]">
                  We implement industry-standard security measures including encryption at rest and in transit (TLS 1.3), row-level security on all user data, and regular security audits. However, no method of transmission over the internet is 100% secure.
                </p>
              ),
            },
            {
              title: "6. Your Rights",
              icon: "users",
              content: (
                <div>
                  <p className="mb-4">You have the right to:</p>
                  <ul className="space-y-2">
                    {[
                      "Access the personal data we hold about you",
                      "Correct inaccurate or incomplete data",
                      "Request deletion of your account and personal data",
                      "Export your data in a portable format",
                      "Opt out of marketing communications at any time",
                      "Object to certain processing activities",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[var(--t3)]">
                        <Ico name="check" size={16} className="shrink-0 mt-0.5 text-[var(--green)]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4">
                    To exercise these rights, email{" "}
                    <a href="mailto:privacy@mikehunt.app" className="text-[var(--amber)] hover:underline">
                      privacy@mikehunt.app
                    </a>
                  </p>
                </div>
              ),
            },
            {
              title: "7. Cookies",
              icon: "alert-triangle",
              content: (
                <p className="text-[var(--t3)]">
                  We use essential cookies for authentication and session management, and analytics cookies to understand platform usage. You can control cookie preferences through your browser settings. Disabling essential cookies may impair Service functionality.
                </p>
              ),
            },
            {
              title: "8. Children's Privacy",
              icon: "alert-triangle",
              content: (
                <p className="text-[var(--t3)]">
                  The Service is not directed to individuals under 18. We do not knowingly collect personal information from minors. If you believe we have collected information from a minor, please contact us immediately.
                </p>
              ),
            },
            {
              title: "9. California Privacy Rights (CCPA)",
              icon: "shield",
              content: (
                <p className="text-[var(--t3)]">
                  California residents have additional rights under the CCPA, including the right to know what personal information we collect, the right to delete personal information, and the right to opt out of the sale of personal information. We do not sell personal information. To exercise your CCPA rights, contact us at{" "}
                  <a href="mailto:privacy@mikehunt.app" className="text-[var(--amber)] hover:underline">
                    privacy@mikehunt.app
                  </a>
                </p>
              ),
            },
            {
              title: "10. Changes to This Policy",
              icon: "refresh",
              content: (
                <p className="text-[var(--t3)]">
                  We may update this Privacy Policy periodically. We will notify you of significant changes via email or in-app notification. Your continued use of the Service after changes constitutes acceptance of the updated policy.
                </p>
              ),
            },
            {
              title: "11. Contact Us",
              icon: "mail",
              content: (
                <p className="text-[var(--t3)]">
                  For privacy-related inquiries, contact our Privacy Team at{" "}
                  <a href="mailto:privacy@mikehunt.app" className="text-[var(--amber)] hover:underline">
                    privacy@mikehunt.app
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
