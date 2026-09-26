import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | MikeHunt",
  description:
    "MikeHunt Privacy Policy — how we collect, use, and protect your data.",
};

export default function PrivacyPolicy() {
  const LAST_UPDATED = "September 26, 2026";

  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-[var(--t2)]">
      <h1 className="text-4xl font-black text-[var(--t1)] mb-2">
        Privacy Policy
      </h1>
      <p className="text-sm text-[var(--t4)] mb-10">Last updated: {LAST_UPDATED}</p>

      <section className="space-y-8 leading-relaxed">
        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">1. Information We Collect</h2>
          <p className="mb-3">We collect the following types of information:</p>
          <ul className="list-disc list-inside space-y-2 text-[var(--t3)]">
            <li>
              <strong className="text-[var(--t2)]">Account information:</strong> Name, email address,
              dealership name, and location when you create an account.
            </li>
            <li>
              <strong className="text-[var(--t2)]">Usage data:</strong> Deal views, search queries,
              saved searches, and feature interactions to improve the platform.
            </li>
            <li>
              <strong className="text-[var(--t2)]">Outcome data:</strong> Vehicle purchase and sale
              outcomes you voluntarily submit to improve valuation accuracy.
            </li>
            <li>
              <strong className="text-[var(--t2)]">Payment information:</strong> Processed securely
              by Stripe. We do not store your card details.
            </li>
            <li>
              <strong className="text-[var(--t2)]">Device &amp; browser data:</strong> IP address,
              browser type, and device information for security and analytics.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">2. How We Use Your Information</h2>
          <ul className="list-disc list-inside space-y-2 text-[var(--t3)]">
            <li>To provide, maintain, and improve the Service</li>
            <li>To personalize deal recommendations to your market and preferences</li>
            <li>To calibrate valuation accuracy based on your logged outcomes</li>
            <li>To send deal alerts and notifications you&rsquo;ve opted into</li>
            <li>To process billing and manage your subscription</li>
            <li>To detect and prevent fraud and security threats</li>
            <li>To comply with legal obligations</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">3. Data Sharing</h2>
          <p className="mb-3">
            We do not sell your personal data. We may share data with:
          </p>
          <ul className="list-disc list-inside space-y-2 text-[var(--t3)]">
            <li>
              <strong className="text-[var(--t2)]">Service providers:</strong> Supabase (database),
              Stripe (payments), Resend (email), Vercel (hosting) — all under data processing agreements.
            </li>
            <li>
              <strong className="text-[var(--t2)]">Aggregated market data:</strong> Anonymized,
              non-identifiable outcome data may be used to improve platform-wide valuation models.
            </li>
            <li>
              <strong className="text-[var(--t2)]">Legal requirements:</strong> When required by law
              or to protect the rights and safety of our users.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">4. Data Retention</h2>
          <p>
            We retain your account data for as long as your account is active or as needed to
            provide the Service. Outcome and transaction data used for model training is retained
            in anonymized form indefinitely. You may request deletion of your personal data
            at any time.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">5. Security</h2>
          <p>
            We implement industry-standard security measures including encryption at rest and
            in transit (TLS 1.3), row-level security on all user data, and regular security
            audits. However, no method of transmission over the internet is 100% secure.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">6. Your Rights</h2>
          <p className="mb-3">You have the right to:</p>
          <ul className="list-disc list-inside space-y-2 text-[var(--t3)]">
            <li>Access the personal data we hold about you</li>
            <li>Correct inaccurate or incomplete data</li>
            <li>Request deletion of your account and personal data</li>
            <li>Export your data in a portable format</li>
            <li>Opt out of marketing communications at any time</li>
            <li>Object to certain processing activities</li>
          </ul>
          <p className="mt-3">
            To exercise these rights, email{" "}
            <a href="mailto:privacy@mikehunt.app" className="text-[var(--amber)] hover:underline">
              privacy@mikehunt.app
            </a>
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">7. Cookies</h2>
          <p>
            We use essential cookies for authentication and session management, and analytics
            cookies to understand platform usage. You can control cookie preferences through
            your browser settings. Disabling essential cookies may impair Service functionality.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">8. Children&rsquo;s Privacy</h2>
          <p>
            The Service is not directed to individuals under 18. We do not knowingly collect
            personal information from minors. If you believe we have collected information from
            a minor, please contact us immediately.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">9. California Privacy Rights (CCPA)</h2>
          <p>
            California residents have additional rights under the CCPA, including the right to
            know what personal information we collect, the right to delete personal information,
            and the right to opt out of the sale of personal information. We do not sell personal
            information. To exercise your CCPA rights, contact us at{" "}
            <a href="mailto:privacy@mikehunt.app" className="text-[var(--amber)] hover:underline">
              privacy@mikehunt.app
            </a>
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy periodically. We will notify you of significant
            changes via email or in-app notification. Your continued use of the Service after
            changes constitutes acceptance of the updated policy.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[var(--t1)] mb-3">11. Contact Us</h2>
          <p>
            For privacy-related inquiries, contact our Privacy Team at{" "}
            <a href="mailto:privacy@mikehunt.app" className="text-[var(--amber)] hover:underline">
              privacy@mikehunt.app
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
