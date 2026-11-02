"use client";

import React from "react";

type BtnVariant = "primary" | "ghost" | "danger";
type BtnSize = "sm" | "md" | "lg";

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
  children: React.ReactNode;
}

export function Btn({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}: BtnProps) {
  const sizeClasses = {
    sm: "px-3 py-2 text-xs",
    md: "px-4 py-3 text-sm",
    lg: "px-6 py-4 text-base",
  };

  const variantClasses = {
    primary: "btn-primary",
    ghost: "btn-ghost",
    danger: "text-white border-none",
  };

  const dangerStyle: React.CSSProperties = { background: "var(--red)" };

  return (
    <button
      disabled={disabled || loading}
      className={`btn inline-flex min-h-11 items-center justify-center gap-2 ${sizeClasses[size]} ${variantClasses[variant]} disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={variant === "danger" ? dangerStyle : undefined}
      {...props}
      aria-busy={loading ? true : props["aria-busy"]}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
        />
      )}
      {children}
    </button>
  );
}
