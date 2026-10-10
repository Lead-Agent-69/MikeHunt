"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { Ico } from "./Ico";
import { Btn } from "./Btn";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    if (typeof window !== "undefined" && (window as any).Sentry) {
      (window as any).Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--s1)]">
          <div className="glass-panel max-w-md w-full p-6 md:p-8 text-center space-y-6">
            {/* Error Icon */}
            <div
              className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
              style={{
                background: "rgba(239,91,107,0.12)",
                border: "1px solid var(--rbd)",
              }}
            >
              <Ico
                name="alert-triangle"
                size={32}
                className="text-[var(--red)]"
              />
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-[var(--t1)]">
                Something went wrong
              </h2>
              <p className="text-sm text-[var(--t3)]">
                We encountered an unexpected error. This has been logged and
                we'll look into it.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Btn
                variant="ghost"
                onClick={this.handleReset}
                className="min-h-[44px]"
              >
                <Ico name="refresh" size={16} />
                Try again
              </Btn>
              <Btn
                variant="primary"
                onClick={this.handleReload}
                className="min-h-[44px]"
              >
                <Ico name="car" size={16} />
                Reload Page
              </Btn>
            </div>

            {/* Support Link */}
            <p className="text-xs text-[var(--t4)]">
              If this problem persists,{" "}
              <a
                href="mailto:support@MikeHunt.com"
                className="text-[var(--amber)] hover:underline font-medium"
              >
                contact support
              </a>
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Functional wrapper for easier use
export function ErrorBoundaryWrapper({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return <ErrorBoundary fallback={fallback}>{children}</ErrorBoundary>;
}
