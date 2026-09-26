"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Database, Zap, TrendingUp, BarChart2, Users, Crown, UserPlus,
  CheckCircle, Shield, RefreshCw, Activity
} from "lucide-react";
import { Mono } from "@/components/shared/Mono";

interface AdminStats {
  totalDeals: number;
  activeDeals: number;
  dealsBySource: Array<{ source: string; count: number; last_scraped: string }>;
  totalUsers: number;
  proUsers: number;
  recentSignups: number;
  outcomeCount: number;
  scrapeHealth: Array<{ source: string; status: string; deals_last_24h: number }>;
  topDeals: Array<{ id: string; year: number; make: string; model: string; true_net_profit: number; deal_verdict: string }>;
  avgProfitScore: number;
  goDealsCount: number;
}

function StatCard({
  label,
  value,
  sub,
  color = "var(--amber)",
  LucideIcon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  LucideIcon?: React.ElementType;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-5 relative overflow-hidden"
    >
      <div
        className="absolute top-0 left-0 h-0.5 w-full"
        style={{ background: color }}
      />
      {LucideIcon && (
        <LucideIcon size={18} className="mb-2" style={{ color }} />
      )}
      <div className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold mb-1">
        {label}
      </div>
      <Mono className="text-3xl font-black text-[var(--t1)]">
        {typeof value === "number" ? value.toLocaleString() : value}
      </Mono>
      {sub && <p className="text-xs text-[var(--t4)] mt-1">{sub}</p>}
    </motion.div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState(false);
  const [rescoreLog, setRescoreLog] = useState<string[]>([]);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stats");
      if (res.status === 403) {
        setError("Access denied. Admin accounts only.");
        return;
      }
      if (!res.ok) throw new Error("Failed to load stats");
      const data = await res.json();
      setStats(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRescore() {
    setRescoring(true);
    setRescoreLog(["Starting rescore..."]);
    try {
      for (let page = 0; page <= 20; page++) {
        const res = await fetch("/api/admin/rescore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page, pageSize: 100 }),
        });
        const data = await res.json();
        setRescoreLog((prev) => [
          ...prev,
          `Page ${page}: rescored ${data.rescored ?? 0} deals`,
        ]);
        if (!data.hasMore) {
          setRescoreLog((prev) => [...prev, "✓ Rescore complete!"]);
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e: any) {
      setRescoreLog((prev) => [...prev, `Error: ${e.message}`]);
    } finally {
      setRescoring(false);
      fetchStats();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[var(--t3)]">Loading admin stats...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-16 glass-panel p-8 text-center">
        <Shield size={32} className="text-[var(--red)] mx-auto mb-3" />
        <h2 className="text-xl font-bold text-[var(--t1)] mb-2">Access Restricted</h2>
        <p className="text-[var(--t3)]">{error}</p>
      </div>
    );
  }

  const sourceColors: Record<string, string> = {
    craigslist: "#FF6B35",
    cars_com: "#4A90E2",
    cargurus: "#27AE60",
    autotrader: "#9B59B6",
    facebook: "#3498DB",
    copart: "#E74C3C",
    iaai: "#F39C12",
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-[var(--t1)]">
            Admin Dashboard
          </h1>
          <p className="text-[var(--t4)] text-sm mt-1">
            Platform health &amp; operations
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchStats}
            className="px-4 py-2 text-sm font-bold rounded-xl bg-[var(--s1)] text-[var(--t2)] border border-[var(--b2)] hover:text-[var(--t1)] transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={handleRescore}
            disabled={rescoring}
            className="px-4 py-2 text-sm font-bold rounded-xl text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            style={{ background: "var(--grad)" }}
          >
            {rescoring ? "Rescoring..." : "Run Rescore"}
          </button>
        </div>
      </div>

      {/* Rescore Log */}
      {rescoreLog.length > 0 && (
        <div className="glass-panel p-4 font-mono text-xs text-[var(--green)] space-y-1 max-h-40 overflow-auto">
          {rescoreLog.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* Deal Stats */}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-[var(--t4)] font-bold mb-4">
          Deal Inventory
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Deals"
            value={stats?.totalDeals ?? 0}
            LucideIcon={Database}
          />
          <StatCard
            label="Active Deals"
            value={stats?.activeDeals ?? 0}
            color="var(--green)"
            LucideIcon={Zap}
          />
          <StatCard
            label="GO Deals"
            value={stats?.goDealsCount ?? 0}
            color="var(--green)"
            LucideIcon={TrendingUp}
            sub="Profit-positive buys"
          />
          <StatCard
            label="Avg Profit Score"
            value={stats?.avgProfitScore ? `${stats.avgProfitScore}/130` : "—"}
            color="var(--purple)"
            LucideIcon={BarChart2}
          />
        </div>
      </div>

      {/* User Stats */}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-[var(--t4)] font-bold mb-4">
          Users
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Users"
            value={stats?.totalUsers ?? 0}
            LucideIcon={Users}
          />
          <StatCard
            label="Pro Subscribers"
            value={stats?.proUsers ?? 0}
            color="var(--amber)"
            LucideIcon={Crown}
          />
          <StatCard
            label="Signups (7d)"
            value={stats?.recentSignups ?? 0}
            color="var(--cyan)"
            LucideIcon={UserPlus}
          />
          <StatCard
            label="Outcomes Logged"
            value={stats?.outcomeCount ?? 0}
            color="var(--purple)"
            LucideIcon={CheckCircle}
            sub="Calibration data points"
          />
        </div>
      </div>

      {/* Deals by Source */}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-[var(--t4)] font-bold mb-4">
          Deal Sources
        </h2>
        <div className="glass-panel p-5">
          <div className="space-y-3">
            {(stats?.dealsBySource ?? []).map((src) => {
              const color = sourceColors[src.source] ?? "var(--amber)";
              const maxCount = Math.max(
                ...(stats?.dealsBySource ?? []).map((s) => s.count),
                1
              );
              const pct = (src.count / maxCount) * 100;
              return (
                <div key={src.source}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-[var(--t2)] capitalize">
                      {src.source.replace(/_/g, " ")}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[var(--t4)]">
                        {src.last_scraped
                          ? `Last scraped ${new Date(src.last_scraped).toLocaleString()}`
                          : "Never scraped"}
                      </span>
                      <Mono className="text-sm font-bold text-[var(--t1)]">
                        {src.count.toLocaleString()}
                      </Mono>
                    </div>
                  </div>
                  <div className="h-2 bg-[var(--s2)] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Deals */}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-[var(--t4)] font-bold mb-4">
          Top Profit Deals
        </h2>
        <div className="glass-panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--b1)]">
                <th className="text-left px-5 py-3 text-[var(--t4)] font-bold text-xs uppercase tracking-wide">
                  Vehicle
                </th>
                <th className="text-right px-5 py-3 text-[var(--t4)] font-bold text-xs uppercase tracking-wide">
                  Net Profit
                </th>
                <th className="text-center px-5 py-3 text-[var(--t4)] font-bold text-xs uppercase tracking-wide">
                  Verdict
                </th>
              </tr>
            </thead>
            <tbody>
              {(stats?.topDeals ?? []).map((deal, i) => {
                const vColor =
                  deal.deal_verdict === "go"
                    ? "var(--green)"
                    : deal.deal_verdict === "hold"
                      ? "var(--amber)"
                      : "var(--red)";
                return (
                  <tr
                    key={deal.id}
                    className="border-b border-[var(--b1)] hover:bg-[var(--s1)] transition-colors cursor-pointer"
                    onClick={() => (window.location.href = `/deal/${deal.id}`)}
                  >
                    <td className="px-5 py-3 font-semibold text-[var(--t1)]">
                      {deal.year} {deal.make} {deal.model}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Mono
                        className="font-bold"
                        style={{
                          color:
                            deal.true_net_profit > 0
                              ? "var(--green)"
                              : "var(--red)",
                        }}
                      >
                        ${Math.round(deal.true_net_profit).toLocaleString()}
                      </Mono>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-bold uppercase text-white"
                        style={{ background: vColor }}
                      >
                        {deal.deal_verdict === "go" ? "BUY" : deal.deal_verdict}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Links */}
      <div className="flex flex-wrap gap-3 pb-8">
        {[
          { label: "Scraper Health", href: "/api/system/health" },
          { label: "Run Scrapers", href: "/api/admin/scrape" },
          { label: "View All Deals", href: "/scan" },
          { label: "Changelog", href: "/changelog" },
        ].map((link) => (
          <a
            key={link.label}
            href={link.href}
            target={link.href.startsWith("/api") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm font-bold rounded-xl bg-[var(--s1)] text-[var(--t2)] border border-[var(--b2)] hover:text-[var(--t1)] hover:border-[var(--b3)] transition-all"
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
