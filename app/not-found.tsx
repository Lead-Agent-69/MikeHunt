import Link from "next/link";
import { Ico } from "@/components/shared/Ico";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--s1)]">
      <div className="glass-panel max-w-md w-full p-6 md:p-8 text-center space-y-6">
        <div
          className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
          style={{
            background: "var(--alo)",
            border: "1px solid var(--amber-bd)",
          }}
        >
          <Ico name="search" size={32} className="text-[var(--amber)]" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-[var(--t1)]">
            Page not found
          </h2>
          <p className="text-sm text-[var(--t3)]">
            The page you're looking for doesn't exist or may have been moved.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 text-sm font-bold rounded-xl px-5 py-2.5 transition-all text-white border-none min-h-[44px]"
          style={{ background: "var(--grad)" }}
        >
          <Ico name="car" size={16} />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
