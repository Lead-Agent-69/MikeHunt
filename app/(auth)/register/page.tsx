"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase";
import { Field } from "@/components/shared/Field";
import { Btn } from "@/components/shared/Btn";
import { Ico } from "@/components/shared/Ico";
import { GoogleButton, OrDivider } from "@/components/shared/GoogleButton";
import Link from "next/link";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClientComponentClient();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // 1. Provision profile & dealer & auth user via secure API route
    try {
      const res = await fetch("/api/auth/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          fullName,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        const errorMessage =
          errorData?.error?.message ||
          errorData?.error ||
          "Failed to create account. Email may already be in use.";
        setError(
          typeof errorMessage === "string"
            ? errorMessage
            : JSON.stringify(errorMessage),
        );
        setLoading(false);
        return;
      }

      // 2. Sign in the newly created user
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(
          "Account created, but failed to automatically log in. Please try logging in manually.",
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--s1)] pb-safe animate-fadeUp">
      <Link href="/" className="flex items-center gap-2.5 mb-8">
        <span
          className="w-8 h-8 rounded-[10px] grid place-items-center text-white shadow-sm"
          style={{ background: "var(--grad)" }}
          aria-hidden
        >
          <Ico name="search" size={17} />
        </span>
        <span className="text-[15px] font-bold tracking-tight text-[var(--t1)]">
          DealerHunt
        </span>
      </Link>

      <div className="glass-panel w-full max-w-sm p-8 flex flex-col gap-6">
        <div className="text-center">
          <h1 className="serif text-3xl font-semibold text-[var(--t1)] mb-1.5 tracking-tight">
            Get started
          </h1>
          <p className="text-sm text-[var(--t3)]">
            Create your account in seconds.
          </p>
        </div>

        {error && (
          <div
            className="p-3 rounded-[var(--r2)] text-sm font-medium border"
            style={{
              backgroundColor: "var(--rlo)",
              color: "var(--red)",
              borderColor: "var(--rbd)",
            }}
          >
            {error}
          </div>
        )}

        <GoogleButton next="/discover" label="Sign up with Google" />
        <OrDivider label="or sign up with email" />

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          <Field
            label="Full name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            placeholder="John Doe"
          />

          <Field
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@dealership.com"
          />

          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="At least 6 characters"
          />

          <Btn type="submit" loading={loading} className="w-full mt-2">
            {loading ? "Creating account..." : "Create account"}
          </Btn>
        </form>

        <p className="text-center text-sm text-[var(--t4)]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-[var(--amber-d)] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
