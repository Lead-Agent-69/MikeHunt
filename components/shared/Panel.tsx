"use client";

import React from "react";

interface PanelProps {
  children: React.ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg" | "none";
  hover?: boolean;
  style?: React.CSSProperties;
}

export function Panel({
  children,
  className = "",
  padding = "md",
  hover = false,
  style,
}: PanelProps) {
  const paddingClasses = {
    none: "",
    sm: "p-3",
    md: "p-5",
    lg: "p-6",
  };

  return (
    <div
      className={`panel ${paddingClasses[padding]} ${hover ? "interactive-surface" : ""} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}
