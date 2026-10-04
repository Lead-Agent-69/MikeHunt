"use client";

import { FileSearch } from "lucide-react";

export function TitleWashDetector({ vin }: { vin: string; state?: string }) {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) return null;
  return (
    <section
      className="border-t border-[var(--b2)] py-5"
      aria-label="Title verification"
    >
      <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--t1)]">
        <FileSearch size={20} aria-hidden="true" /> Title verification
      </h2>
      <p className="mt-2 break-all text-sm text-[var(--t3)]">VIN: {vin}</p>
      <p className="mt-3 text-sm leading-relaxed text-[var(--t2)]">
        Official title and registration history has not been verified.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[var(--t4)]">
        Listing locations are not registration records. A seller&apos;s
        clean-title claim does not rule out prior damage. Request the title
        documents and an independent vehicle-history report before purchase.
      </p>
    </section>
  );
}
