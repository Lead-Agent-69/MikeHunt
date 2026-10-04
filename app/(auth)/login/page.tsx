"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { Field, PasswordField } from "@/components/shared/Field";
import { Btn } from "@/components/shared/Btn";
import { Ico } from "@/components/shared/Ico";
import { GoogleButton, OrDivider } from "@/components/shared/GoogleButton";
import { MikeHuntLogo, MikeHuntMark } from "@/components/brand/MikeHuntLogo";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [next, setNext] = useState("/discover");
  const router = useRouter();
  const supabase = createClientComponentClient();
  const configured = isSupabaseConfigured();

  useEffect(() => {
    const requestedNext = new URLSearchParams(window.location.search).get(
      "next",
    );
    if (requestedNext?.startsWith("/")) setNext(requestedNext);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!configured) {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Failed to start a local demo session.");
        setLoading(false);
        return;
      }

      router.push(next);
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      const bootstrap = await fetch("/api/auth/bootstrap", { method: "POST" });
      if (!bootstrap.ok) {
        setError(
          "Signed in, but account setup could not be completed. Please retry.",
        );
        setLoading(false);
        return;
      }
      // Land on the deal feed after signing in.
      router.push(next);
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 pb-6 pt-24 sm:p-6 bg-[var(--s1)] pb-safe animate-fadeUp">
      {/* Professional Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-6">
        <Link
          href="/"
          aria-label="MIKEHUNT home"
          className="inline-flex items-center gap-2.5"
        >
          <MikeHuntLogo size="md" />
        </Link>
      </div>

      {/* Professional Card */}
      <div className="w-full max-w-md">
        <div className="glass-panel p-8 sm:p-10 flex flex-col gap-6">
          {/* Header */}
          <div className="text-center">
            <MikeHuntMark size="lg" className="mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-[var(--t1)] mb-2">
              Welcome back
            </h1>
            <p className="text-base text-[var(--t3)]">
              {configured
                ? "Sign in to access your vehicle intelligence dashboard"
                : "Preview the live public inventory while account sync is being connected"}
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div
              className="p-4 rounded-xl text-sm font-medium border flex items-start gap-3"
              style={{
                backgroundColor: "var(--rlo)",
                color: "var(--red)",
                borderColor: "var(--rbd)",
              }}
            >
              <Ico name="alert-triangle" size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Social Login */}
          <GoogleButton next={next} />
          <OrDivider
            label={
              configured ? "or continue with email" : "or start local demo"
            }
          />

          {/* Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <Field
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@dealership.com"
              className="text-base"
            />

            <PasswordField
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={configured}
              autoComplete="current-password"
              placeholder={configured ? "••••••••••" : "optional in local demo"}
              className="text-base"
            />

            <div className="flex items-center justify-between gap-3 text-sm">
              <span
                className="flex items-center gap-2 text-[var(--t3)]"
                role="status"
              >
                <Ico name="shield" size={14} />
                Stays signed in until you log out
              </span>
              <Link
                href="/forgot-password"
                className="text-[var(--amber-d)] hover:underline font-medium"
              >
                Forgot password?
              </Link>
            </div>

            <Btn
              type="submit"
              loading={loading}
              className="w-full py-3 text-base font-semibold"
            >
              {loading
                ? configured
                  ? "Signing in..."
                  : "Starting demo..."
                : configured
                  ? "Sign in to your account"
                  : "Start local preview session"}
            </Btn>
          </form>

          {/* Footer */}
          <div className="text-center pt-4 border-t border-[var(--b1)]">
            <p className="text-sm text-[var(--t4)] mb-2">
              New to MikeHunt?{" "}
              <Link
                href="/register"
                className="font-semibold text-[var(--amber-d)] hover:underline"
              >
                Create your free account
              </Link>
            </p>
            <p className="text-xs text-[var(--t5)]">
              By signing in, you agree to our{" "}
              <Link
                href="/tos"
                className="text-[var(--t4)] hover:text-[var(--t1)]"
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="text-[var(--t4)] hover:text-[var(--t1)]"
              >
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="mt-6 flex items-center justify-center gap-6 text-xs text-[var(--t4)]">
          <div className="flex items-center gap-1.5">
            <Ico name="shield" size={14} />
            <span>Secure login</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Ico name="check-circle" size={14} />
            <span>Encrypted data</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Ico name="clock" size={14} />
            <span>Source proof</span>
          </div>
        </div>
      </div>
    </div>
  );
}
