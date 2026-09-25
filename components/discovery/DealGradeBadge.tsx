"use client";

import React from "react";

export type DealGrade = "great" | "good" | "fair" | "high" | "unknown";

interface DealGradeBadgeProps {
  grade: DealGrade;
  /** Human label, e.g. "Great Deal" */
  gradeLabel?: string;
  /** % below market — shown for great/good grades */
  discountPct?: number;
  className?: string;
}

const GRADE_STYLES: Record<
  DealGrade,
  { bg: string; text: string; border: string }
> = {
  great: { bg: "var(--glo)", text: "var(--green)", border: "var(--gbd)" },
  good: { bg: "var(--blo)", text: "var(--blue)", border: "var(--bbd)" },
  fair: { bg: "var(--s2)", text: "var(--t3)", border: "var(--b2)" },
  high: { bg: "var(--amber-lo)", text: "var(--t4)", border: "var(--amber-bd)" },
  unknown: { bg: "", text: "", border: "" },
};

/**
 * Small CarGurus-style deal-rating pill. Colored by market-relative grade.
 * For great/good deals it surfaces the discount ("Great Deal · 28% below market").
 * Hidden entirely for unknown grades.
 */
export function DealGradeBadge({
  grade,
  gradeLabel,
  discountPct,
  className = "",
}: DealGradeBadgeProps) {
  if (grade === "unknown") return null;

  const s = GRADE_STYLES[grade];
  const showDiscount =
    (grade === "great" || grade === "good") &&
    typeof discountPct === "number" &&
    discountPct > 0;
  const label =
    gradeLabel ||
    (grade === "great"
      ? "Great Deal"
      : grade === "good"
        ? "Good Deal"
        : grade === "fair"
          ? "Fair Price"
          : "Priced High");

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold leading-none ${className}`}
      style={{
        background: s.bg,
        color: s.text,
        border: `1px solid ${s.border}`,
      }}
    >
      {(grade === "great" || grade === "good") && (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
      <span>{label}</span>
      {showDiscount && (
        <span className="font-mono font-semibold opacity-80">
          · {discountPct}% below
        </span>
      )}
    </span>
  );
}
