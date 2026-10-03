"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { Field } from "@/components/shared/Field";
import { Btn } from "@/components/shared/Btn";
import { Ico } from "@/components/shared/Ico";
import { GoogleButton, OrDivider } from "@/components/shared/GoogleButton";
import { MikeHuntLogo, MikeHuntMark } from "@/components/brand/MikeHuntLogo";
import Link from "next/link";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [liveStats, setLiveStats] = useState<{
    activeDeals: number | null;
    readySources: number | null;
  }>({ activeDeals: null, readySources: null });
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/system/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((status) => {
        if (cancelled || !status) return;
        setLiveStats({
          activeDeals:
            typeof status.activeDeals === "number" ? status.activeDeals : null,
          readySources:
            typeof status.sourceHealth?.readySources === "number"
              ? status.sourceHealth.readySources
              : null,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (!isSupabaseConfigured()) {
        const res = await fetch("/api/auth/demo-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name: fullName }),
        });
        if (!res.ok) throw new Error("Could not start the local preview.");
        router.push("/onboarding");
        router.refresh();
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (!data.session) {
        setNotice(
          "Check your email to confirm your account. The confirmation link will return you to setup.",
        );
        setLoading(false);
        return;
      }

      const bootstrap = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
      });
      if (!bootstrap.ok) {
        setError(
          "Account created, but setup could not be completed. Please sign in again.",
        );
        setLoading(false);
        return;
      }
    } catch (e) {
      console.error("Failed to call provision endpoint:", e);
      setError("An unexpected error occurred.");
      setLoading(false);
      return;
    }

    // New dealers go through the quick setup wizard first (sets state/profit/makes).
    router.push("/onboarding");
    router.refresh();
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
              Create your account
            </h1>
            <p className="text-base text-[var(--t3)]">
              Start finding underpriced vehicles with source-backed market
              intelligence
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

          {notice && (
            <div className="p-4 rounded-xl text-sm font-medium border border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]">
              {notice}
            </div>
          )}

          {/* Social Login */}
          <GoogleButton next="/discover" label="Sign up with Google" />
          <OrDivider label="or continue with email" />

          {/* Form */}
          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            <Field
              label="Full name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="John Doe"
              className="text-base"
            />

            <Field
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@dealership.com"
              className="text-base"
            />

            <Field
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="At least 6 characters"
              className="text-base"
            />

            <div className="flex items-start gap-2 text-xs text-[var(--t4)]">
              <Ico name="check-circle" size={14} className="shrink-0 mt-0.5" />
              <span>
                By creating an account, you agree to our{" "}
                <Link
                  href="/tos"
                  className="text-[var(--amber-d)] hover:underline"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="text-[var(--amber-d)] hover:underline"
                >
                  Privacy Policy
                </Link>
              </span>
            </div>

            <Btn
              type="submit"
              loading={loading}
              className="w-full py-3 text-base font-semibold"
            >
              {loading ? "Creating account..." : "Create your free account"}
            </Btn>
          </form>

          {/* Footer */}
          <div className="text-center pt-4 border-t border-[var(--b1)]">
            <p className="text-sm text-[var(--t4)] mb-2">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-[var(--amber-d)] hover:underline"
              >
                Sign in
              </Link>
            </p>
            <p className="text-xs text-[var(--t5)]">
              Free to start. No credit card required.
            </p>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="mt-6 flex items-center justify-center gap-6 text-xs text-[var(--t4)]">
          <div className="flex items-center gap-1.5">
            <Ico name="shield" size={14} />
            <span>Secure signup</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Ico name="check-circle" size={14} />
            <span>Encrypted data</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Ico name="zap" size={14} />
            <span>Source proof</span>
          </div>
        </div>

        {/* Benefits */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-lg bg-[var(--s0)] border border-[var(--b2)]">
            <div className="text-lg font-bold text-[var(--t1)] mb-1">
              {liveStats.activeDeals?.toLocaleString() || "Live"}
            </div>
            <div className="text-xs text-[var(--t4)]">Active deals</div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--s0)] border border-[var(--b2)]">
            <div className="text-lg font-bold text-[var(--t1)] mb-1">
              {liveStats.readySources ?? "Multi"}
            </div>
            <div className="text-xs text-[var(--t4)]">Ready sources</div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--s0)] border border-[var(--b2)]">
            <div className="text-lg font-bold text-[var(--t1)] mb-1">Free</div>
            <div className="text-xs text-[var(--t4)]">To start</div>
          </div>
        </div>
      </div>
    </div>
  );
}
