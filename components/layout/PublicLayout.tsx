"use client";

import React from "react";
import Link from "next/link";
import { Ico } from "@/components/shared/Ico";
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
                href="/#features"
                className="text-sm font-medium text-[var(--t3)] hover:text-[var(--t1)] transition-colors"
              >
                Features
              </Link>
              <Link
                href="/#pricing"
                className="text-sm font-medium text-[var(--t3)] hover:text-[var(--t1)] transition-colors"
              >
                Pricing
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

      {/* Professional Footer */}
      <footer className="border-t border-[var(--b1)] bg-[var(--s0)] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Company */}
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <MikeHuntLogo size="sm" />
              </div>
              <p className="text-sm text-[var(--t4)] mb-4">
                Vehicle sourcing intelligence for dealers. Find underpriced cars
                with AI-powered market analysis.
              </p>
              <div className="flex gap-4">
                <a
                  href="#"
                  className="text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                  aria-label="Twitter"
                >
                  <Ico name="message" size={20} />
                </a>
                <a
                  href="#"
                  className="text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                  aria-label="LinkedIn"
                >
                  <Ico name="users" size={20} />
                </a>
              </div>
            </div>

            {/* Product */}
            <div>
              <h3 className="text-sm font-bold text-[var(--t1)] mb-4">
                Product
              </h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/#features"
                    className="text-sm text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                  >
                    Features
                  </Link>
                </li>
                <li>
                  <Link
                    href="/#pricing"
                    className="text-sm text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                  >
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link
                    href="/#integrations"
                    className="text-sm text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                  >
                    Integrations
                  </Link>
                </li>
                <li>
                  <Link
                    href="/#api"
                    className="text-sm text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                  >
                    API
                  </Link>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h3 className="text-sm font-bold text-[var(--t1)] mb-4">
                Company
              </h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/about"
                    className="text-sm text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                  >
                    About
                  </Link>
                </li>
                <li>
                  <Link
                    href="/blog"
                    className="text-sm text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                  >
                    Blog
                  </Link>
                </li>
                <li>
                  <Link
                    href="/careers"
                    className="text-sm text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                  >
                    Careers
                  </Link>
                </li>
                <li>
                  <Link
                    href="/contact"
                    className="text-sm text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                  >
                    Contact
                  </Link>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h3 className="text-sm font-bold text-[var(--t1)] mb-4">Legal</h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/privacy"
                    className="text-sm text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/tos"
                    className="text-sm text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                  >
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link
                    href="/security"
                    className="text-sm text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                  >
                    Security
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-[var(--b1)] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-[var(--t4)]">
              © {new Date().getFullYear()} MikeHunt. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <span className="text-sm text-[var(--t4)]">Made with</span>
              <div className="flex items-center gap-1 text-[var(--t4)]">
                <Ico name="car" size={16} />
                <Ico name="dollar" size={16} />
                <Ico name="star" size={16} />
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
