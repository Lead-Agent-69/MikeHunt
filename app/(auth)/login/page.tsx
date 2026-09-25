"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase";
import { Field } from "@/components/shared/Field";
import { Btn } from "@/components/shared/Btn";
import { Ico } from "@/components/shared/Ico";
import { GoogleButton, OrDivider } from "@/components/shared/GoogleButton";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClientComponentClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

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
            Welcome back
          </h1>
          <p className="text-sm text-[var(--t3)]">Sign in to keep hunting.</p>
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

        <GoogleButton next="/discover" />
        <OrDivider label="or sign in with email" />

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
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
            placeholder="••••••••"
          />

          <Btn type="submit" loading={loading} className="w-full mt-2">
            {loading ? "Signing in..." : "Sign in"}
          </Btn>
        </form>

        <p className="text-center text-sm text-[var(--t4)]">
          New to DealerHunt?{" "}
          <Link
            href="/register"
            className="font-semibold text-[var(--amber-d)] hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
