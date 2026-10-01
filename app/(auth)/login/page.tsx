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
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    if (isSupabaseConfigured()) return;
    fetch("/api/system/status")
      .then((res) => res.json())
      .then((data) => setReadiness(data?.readiness || null))
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!isSupabaseConfigured()) {
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

      router.push("/discover");
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
      // Land on the deal feed after signing in.
      router.push("/discover");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--s1)] pb-safe animate-fadeUp">
      {/* Professional Header */}
      <div className="absolute top-0 left-0 right-0 p-6">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg"
            style={{ background: "var(--grad)" }}
            aria-hidden
          >
            <Ico name="search" size={20} />
          </div>
          <span className="text-xl font-bold tracking-tight text-[var(--t1)]">
            MikeHunt
          </span>
        </Link>
      </div>

      {/* Professional Card */}
      <div className="w-full max-w-md">
        <div className="glass-panel p-8 sm:p-10 flex flex-col gap-6">
          {/* Header */}
          <div className="text-center">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ background: "var(--grad)" }}
            >
              <Ico name="users" size={32} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-[var(--t1)] mb-2">
              Welcome back
            </h1>
            <p className="text-base text-[var(--t3)]">
              Sign in to access your vehicle intelligence dashboard
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
          <GoogleButton next="/discover" />
          {readiness && !readiness.ready && (
            <div className="rounded-[var(--r3)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] p-4">
              <div className="text-sm font-black text-[var(--t1)]">
                Real data setup needed
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
                Google login and live inventory are waiting on production
                provider setup.
              </p>
              <div className="mt-3 space-y-2">
                {readiness.items
                  ?.filter((item: any) => item.status !== "ready")
                  .slice(0, 3)
                  .map((item: any) => (
                    <div
                      key={item.id}
                      className="rounded-[var(--r2)] bg-[var(--s0)] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold text-[var(--t2)]">
                          {item.label}
                        </span>
                        <span className="text-[10px] font-black uppercase text-[var(--amber-d)]">
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
                        {item.nextStep}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}
          <OrDivider label="or continue with email" />

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

            <Field
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={isSupabaseConfigured()}
              placeholder="••••••••••"
              className="text-base"
            />

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-[var(--t3)] cursor-pointer">
                <input type="checkbox" className="rounded border-[var(--b2)]" />
                Remember me
              </label>
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
              {loading ? "Signing in..." : "Sign in to your account"}
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
            <span>24/7 support</span>
          </div>
        </div>
      </div>
    </div>
  );
}
