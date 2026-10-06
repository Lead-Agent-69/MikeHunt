"use client";

import React from "react";
import Link from "next/link";
import { MikeHuntLogo } from "@/components/brand/MikeHuntLogo";

interface PublicLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export function PublicLayout({
  children,
  title,
  description,
}: PublicLayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--s1)]">
      {/* Professional Navigation */}
      <nav className="sticky top-0 z-50 border-b border-[var(--b1)] bg-[var(--s0)]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link
              href="/"
              aria-label="MIKEHUNT home"
              className="flex items-center gap-2.5"
            >
              <MikeHuntLogo size="sm" />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <Link
                href="/"
                className="text-sm font-medium text-[var(--t3)] hover:text-[var(--t1)] transition-colors"
              >
                Home
              </Link>
              <Link
                href="/#how-it-works"
                className="text-sm font-medium text-[var(--t3)] hover:text-[var(--t1)] transition-colors"
              >
                How it works
              </Link>
              <Link
                href="/privacy"
                className="text-sm font-medium text-[var(--t3)] hover:text-[var(--t1)] transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/tos"
                className="text-sm font-medium text-[var(--t3)] hover:text-[var(--t1)] transition-colors"
              >
                Terms
              </Link>
            </div>

            {/* CTA Buttons */}
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-sm font-semibold text-[var(--t2)] hover:text-[var(--t1)] transition-colors hidden sm:block"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
                style={{ background: "var(--grad)" }}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Page Content */}
      <main className="flex-1">
        {title && (
          <div className="bg-[var(--s0)] border-b border-[var(--b1)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
              <h1 className="text-3xl md:text-4xl font-bold text-[var(--t1)] mb-2">
                {title}
              </h1>
              {description && (
                <p className="text-lg text-[var(--t3)] max-w-2xl">
                  {description}
                </p>
              )}
            </div>
          </div>
        )}
        {children}
      </main>

      {/* Footer: only routes that exist. Mirrors the landing page footer. */}
      <footer className="border-t border-[var(--b1)] bg-[var(--s0)] mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex flex-col gap-2">
            <MikeHuntLogo size="sm" />
            <p className="text-sm text-[var(--t4)]">
              Used-car sourcing for personal buyers, builders, parts buyers,
              resellers, and dealers.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-[var(--t3)]">
            <Link href="/" className="hover:text-[var(--t1)]">
              Home
            </Link>
            <Link href="/privacy" className="hover:text-[var(--t1)]">
              Privacy
            </Link>
            <Link href="/tos" className="hover:text-[var(--t1)]">
              Terms
            </Link>
            <Link href="/login" className="hover:text-[var(--t1)]">
              Sign in
            </Link>
          </div>
        </div>
        <p className="border-t border-[var(--b1)] px-4 py-4 text-center text-xs text-[var(--t4)]">
          © {new Date().getFullYear()} MikeHunt. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
