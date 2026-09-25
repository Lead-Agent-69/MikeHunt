"use client";

import React from "react";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  onClose?: () => void;
}

export function Toast({ message, type = "info", onClose }: ToastProps) {
  const colorClasses = {
    success:
      "bg-[rgba(16,185,129,.10)] text-[var(--green)] border-[rgba(16,185,129,.20)]",
    error:
      "bg-[rgba(239,68,68,.10)] text-[var(--red)] border-[rgba(239,68,68,.20)]",
    info: "bg-[rgba(59,130,246,.10)] text-[var(--blue)] border-[rgba(59,130,246,.20)]",
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-4 py-3 border ${colorClasses[type]} animate-fade-in`}
    >
      <span className="text-sm font-medium">{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          className="text-[var(--t3)] hover:text-[var(--t1)] transition-colors"
        >
          ×
        </button>
      )}
    </div>
  );
}
