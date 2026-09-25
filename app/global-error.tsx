"use client";

// Root error boundary — the last line of defence. Catches errors thrown in the ROOT layout itself (which
// app/error.tsx cannot), preventing a blank white screen. It replaces the whole document, so it renders
// its own <html>/<body> with inline styles (app CSS may not be available) and reports to Sentry.

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#0b0b0f",
          color: "#e6e6eb",
        }}
      >
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              opacity: 0.7,
              margin: "0 0 24px",
            }}
          >
            An unexpected error occurred and has been logged. Please try again —
            if it keeps happening, reload the page.
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => reset()}
              style={{
                cursor: "pointer",
                border: "none",
                borderRadius: 12,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                background: "linear-gradient(135deg,#f59e0b,#d97706)",
              }}
            >
              Try again
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              style={{
                cursor: "pointer",
                border: "1px solid #2a2a33",
                borderRadius: 12,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                color: "#e6e6eb",
                background: "#16161c",
              }}
            >
              Go home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
