"use client";

import React from "react";
import { Ico } from "@/components/shared/Ico";

// Reach the seller without leaving the app. Phone → Call + Text (tel:/sms:), email → Email (mailto:),
// and the original listing is always one tap away. Each action renders only when we actually have that
// channel (extracted at scrape time into options.contact). Plain anchors so they work on mobile.
export function ContactSeller({
  contact,
  sourceUrl,
}: {
  contact?: { phone?: string; email?: string; listingUrl?: string };
  sourceUrl?: string;
}) {
  const phone = contact?.phone;
  const email = contact?.email;
  const listing = contact?.listingUrl || sourceUrl;
  // Nothing actionable at all — don't render an empty shell.
  if (!phone && !email && !listing) return null;

  const tel = phone ? phone.replace(/[^\d]/g, "") : "";

  return (
    <div
      className="rounded-[var(--r3)] p-4"
      style={{ background: "var(--s1)", boxShadow: "var(--shadow)" }}
    >
      <div
        className="mb-3 text-xs font-bold uppercase tracking-wide"
        style={{ color: "var(--t3)" }}
      >
        Contact seller
      </div>
      {!phone && !email && (
        <p className="mb-2 text-[11px] text-[var(--t4)]">
          No saved phone or email for this listing — reach the seller through
          the original listing.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {phone && (
          <>
            <ContactBtn
              href={`tel:${tel}`}
              icon="phone"
              label="Call"
              sub={phone}
              accent="var(--green)"
            />
            <ContactBtn
              href={`sms:${tel}`}
              icon="message"
              label="Text"
              accent="var(--green)"
            />
          </>
        )}
        {email && (
          <ContactBtn
            href={`mailto:${email}`}
            icon="mail"
            label="Email"
            sub={email}
            accent="var(--t1)"
          />
        )}
        {listing && (
          <ContactBtn
            href={listing}
            icon="external"
            label="View original"
            external
            accent="var(--t2)"
          />
        )}
      </div>
    </div>
  );
}

function ContactBtn({
  href,
  icon,
  label,
  sub,
  external,
  accent,
}: {
  href: string;
  icon: "phone" | "message" | "mail" | "external";
  label: string;
  sub?: string;
  external?: boolean;
  accent?: string;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex items-center gap-2 rounded-[var(--r2)] px-3 py-2 text-sm font-bold transition-colors"
      style={{ background: "var(--s2)", color: "var(--t1)" }}
    >
      <Ico name={icon} size={15} className="shrink-0" />
      <span className="flex flex-col leading-tight">
        <span style={accent ? { color: accent } : undefined}>{label}</span>
        {sub && (
          <span
            className="text-[11px] font-medium"
            style={{ color: "var(--t3)" }}
          >
            {sub}
          </span>
        )}
      </span>
    </a>
  );
}
