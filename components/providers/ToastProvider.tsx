"use client";

import { Toaster } from "sonner";

export function ToastProvider() {
  return (
    <Toaster
      position="top-center"
      expand={false}
      richColors
      closeButton
      duration={3000}
      toastOptions={{
        style: {
          background: "var(--t1)",
          border: "none",
          color: "var(--s1)",
          borderRadius: "30px",
          fontSize: "13.5px",
          fontWeight: "600",
          boxShadow: "var(--shadow)",
        },
      }}
    />
  );
}
