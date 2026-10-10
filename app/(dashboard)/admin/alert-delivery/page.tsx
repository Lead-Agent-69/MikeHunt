"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  TRACKED_STAGES,
  type ChannelSummary,
  type Stage,
} from "@/lib/alerts/delivery-summary";

type Recent = {
  id: string;
  kind: string | null;
  channel: string;
  status: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
};

type Payload = {
  configured: boolean;
  days: number;
  capped?: boolean;
  summary: ChannelSummary[];
  recent: Recent[];
  error?: string;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(res.status === 401 ? "Admins only." : "Could not load.");
  return res.json();
};

const STAGES: Stage[] = ["sent", "delivered", "opened", "clicked"];
const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  push: "Push",
  sms: "SMS",
};
const NOT_TRACKED: Record<string, string> = {
  "push:opened": "Push has no separate open event",
  "sms:delivered": "Needs a Twilio status callback (not wired)",
  "sms:opened": "SMS has no open event",
};

const pct = (n: number | undefined) =>
  n == null ? "" : `${Math.round(n * 100)}%`;
const when = (v: string | null) => (v ? new Date(v).toLocaleString() : "—");

// Admin-only: /admin/* is gated in proxy.ts (ADMIN_ROUTES) and the API checks the admin gate again.
export default function AlertDeliveryAdminPage() {
  const [days, setDays] = useState<7 | 30>(7);
  const { data, error, isLoading } = useSWR<Payload>(
    `/api/admin/alert-deliveries?days=${days}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--t1)]">
            Alert delivery
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--t3)]">
            Sent, delivered, opened and clicked per channel for alert
            notifications. Email opens are approximate: image blocking hides
            some, and mail privacy proxies open others automatically.
          </p>
        </div>
        <div role="group" aria-label="Time range" className="flex gap-2">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={`min-h-11 rounded-md border px-3 text-sm font-semibold ${
                days === d
                  ? "border-[var(--blue)] text-[var(--blue)]"
                  : "border-[var(--b2)] text-[var(--t2)]"
              }`}
            >
              Last {d} days
            </button>
          ))}
        </div>
      </header>

      {isLoading && <p className="text-sm text-[var(--t4)]">Loading…</p>}
      {error && (
        <p role="alert" className="text-sm text-[var(--red)]">
          {error.message}
        </p>
      )}
      {data?.error && (
        <p role="alert" className="text-sm text-[var(--amber-d)]">
          {data.error}
        </p>
      )}

      {data?.configured && (
        <>
          <div className="overflow-x-auto rounded-lg border border-[var(--b1)]">
            <table className="w-full text-sm">
              <caption className="sr-only">Delivery funnel by channel</caption>
              <thead className="bg-[var(--s1)] text-left text-xs uppercase text-[var(--t4)]">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Channel
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Total
                  </th>
                  {STAGES.map((s) => (
                    <th key={s} scope="col" className="px-4 py-3 capitalize">
                      {s}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3">
                    Failed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--b1)]">
                {data.summary.map((c) => (
                  <tr key={c.channel}>
                    <th
                      scope="row"
                      className="px-4 py-3 text-left font-semibold"
                    >
                      {CHANNEL_LABEL[c.channel] || c.channel}
                    </th>
                    <td className="px-4 py-3 font-mono">{c.total}</td>
                    {STAGES.map((s) =>
                      TRACKED_STAGES[c.channel].includes(s) ? (
                        <td key={s} className="px-4 py-3 font-mono">
                          {c.stages[s] ?? 0}
                          {s !== "sent" && (
                            <span className="ml-1 text-xs text-[var(--t4)]">
                              {pct(c.rates[s])}
                            </span>
                          )}
                        </td>
                      ) : (
                        <td
                          key={s}
                          className="px-4 py-3 text-xs text-[var(--t4)]"
                          title={NOT_TRACKED[`${c.channel}:${s}`]}
                        >
                          Not tracked
                        </td>
                      ),
                    )}
                    <td className="px-4 py-3 font-mono">{c.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.capped && (
            <p className="text-xs text-[var(--t4)]">
              Showing the most recent 20,000 deliveries in this range.
            </p>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold text-[var(--t2)]">
              Recent deliveries
            </h2>
            {data.recent.length === 0 ? (
              <p className="text-sm text-[var(--t4)]">
                No alert deliveries in this range yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--b1)]">
                <table className="w-full text-xs">
                  <caption className="sr-only">
                    Most recent 25 deliveries
                  </caption>
                  <thead className="bg-[var(--s1)] text-left uppercase text-[var(--t4)]">
                    <tr>
                      <th scope="col" className="px-3 py-2">
                        Created
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Kind
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Channel
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Delivered
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Opened
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Clicked
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--b1)]">
                    {data.recent.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2">{when(r.created_at)}</td>
                        <td className="px-3 py-2">
                          {(r.kind || "").replace(/_/g, " ")}
                        </td>
                        <td className="px-3 py-2">
                          {CHANNEL_LABEL[r.channel] || r.channel}
                        </td>
                        <td className="px-3 py-2">{r.status}</td>
                        <td className="px-3 py-2">{when(r.delivered_at)}</td>
                        <td className="px-3 py-2">{when(r.opened_at)}</td>
                        <td className="px-3 py-2">{when(r.clicked_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
