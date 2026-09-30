"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { DNACarousel, type CarouselItem } from "./dna-carousel";
import { PremiumCarousel, type PremiumCarouselItem } from "./premium-carousel";
import { EditorialCard, type EditorialCardData } from "./editorial-card";
import { OptimizedSkeletonGrid, OptimizedSkeletonCarousel, OptimizedErrorState, OptimizedButton } from "./carousel-showcase";

// ── Live Data Hook ──
interface UseLiveDealsOptions {
  endpoint: string;
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseLiveDealsResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  lastUpdated: Date | null;
}

export function useLiveDeals<T>({ endpoint, limit = 10, autoRefresh = false, refreshInterval = 60000 }: UseLiveDealsOptions): UseLiveDealsResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`${endpoint}?limit=${limit}`);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const json = await res.json();
      setData(json.items || json.deals || json || []);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [endpoint, limit]);

  useEffect(() => {
    fetchData();
    if (autoRefresh) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, autoRefresh, refreshInterval]);

  return { data, loading, error, refresh: fetchData, lastUpdated };
}

// ── Live DNA Carousel ──
interface LiveDNACarouselProps {
  endpoint?: string;
  fallbackItems?: CarouselItem[];
  className?: string;
}

export function LiveDNACarousel({ endpoint = "/api/deals", fallbackItems = [], className }: LiveDNACarouselProps) {
  const { data, loading, error, refresh, lastUpdated } = useLiveDeals<any>({ endpoint, limit: 5 });

  const items: CarouselItem[] = data.length > 0
    ? data.slice(0, 5).map((deal: any) => ({
        id: deal.id,
        image: deal.image_url || deal.image || "/images/car-placeholder.jpg",
        title: `${deal.year} ${deal.make} ${deal.model}`.trim(),
        subtitle: deal.location_state ? `${deal.location_state} · ${deal.mileage?.toLocaleString() || ""} miles` : undefined,
        category: deal.deal_verdict?.toUpperCase() || deal.source,
        description: deal.true_net_profit ? `Net profit: $${deal.true_net_profit.toLocaleString()}` : undefined,
        cta: "View Deal",
      }))
    : fallbackItems;

  if (loading) return <OptimizedSkeletonCarousel className={className} />;
  if (error) return <OptimizedErrorState title="Failed to load deals" message={error} onRetry={refresh} className={className} />;
  if (items.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--t1)]">Featured Deals</h2>
          {lastUpdated && <p className="text-xs text-[var(--t4)]">Updated {lastUpdated.toLocaleTimeString()}</p>}
        </div>
        <OptimizedButton variant="ghost" size="sm" onClick={refresh}>
          <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          Refresh
        </OptimizedButton>
      </div>
      <DNACarousel items={items} autoPlay={true} autoPlaySpeed={4000} depth={250} curve={0.8} helixSpread={0.8} perspective={1200} imageWidth={240} imageHeight={320} imageRadius={16} blur={5} rgbSplit={2} inactiveOpacity={0.3} shadow={true} shadowStrength={0.2} />
    </div>
  );
}

// ── Live Premium Carousel ──
interface LivePremiumCarouselProps {
  endpoint?: string;
  fallbackItems?: PremiumCarouselItem[];
  className?: string;
}

export function LivePremiumCarousel({ endpoint = "/api/deals/best-buy", fallbackItems = [], className }: LivePremiumCarouselProps) {
  const { data, loading, error, refresh, lastUpdated } = useLiveDeals<any>({ endpoint, limit: 5 });

  const items: PremiumCarouselItem[] = data.length > 0
    ? data.slice(0, 5).map((deal: any) => ({
        id: deal.id,
        image: deal.image_url || deal.image || "/images/car-placeholder.jpg",
        title: `${deal.year} ${deal.make} ${deal.model}`.trim(),
        subtitle: deal.location_state ? `${deal.location_state} · ${deal.mileage?.toLocaleString() || ""} miles` : undefined,
        category: deal.deal_verdict?.toUpperCase() || deal.source,
        description: deal.true_net_profit ? `Net profit: $${deal.true_net_profit.toLocaleString()}` : undefined,
        price: deal.ask_price ? `$${deal.ask_price.toLocaleString()}` : undefined,
        year: deal.year,
        mileage: deal.mileage ? `${deal.mileage.toLocaleString()} mi` : undefined,
        cta: "View Deal",
      }))
    : fallbackItems;

  if (loading) return <OptimizedSkeletonCarousel className={className} />;
  if (error) return <OptimizedErrorState title="Failed to load deals" message={error} onRetry={refresh} className={className} />;
  if (items.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--t1)]">Top Picks</h2>
          {lastUpdated && <p className="text-xs text-[var(--t4)]">Updated {lastUpdated.toLocaleTimeString()}</p>}
        </div>
        <OptimizedButton variant="ghost" size="sm" onClick={refresh}>
          <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          Refresh
        </OptimizedButton>
      </div>
      <PremiumCarousel items={items} autoPlay={true} autoPlaySpeed={4000} />
    </div>
  );
}

// ── Live Editorial Grid ──
interface LiveEditorialGridProps {
  endpoint?: string;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function LiveEditorialGrid({ endpoint = "/api/feed", columns = 3, className }: LiveEditorialGridProps) {
  const { data, loading, error, refresh } = useLiveDeals<any>({ endpoint, limit: 6 });

  const items: EditorialCardData[] = data.length > 0
    ? data.slice(0, 6).map((deal: any) => ({
        id: deal.id,
        image: deal.image_url || deal.image || "/images/car-placeholder.jpg",
        title: `${deal.year} ${deal.make} ${deal.model}`.trim(),
        category: deal.source || "Deal",
        year: deal.year?.toString() || "",
        description: deal.forYouReason || `${deal.make} ${deal.model} · ${deal.locationCity}, ${deal.locationState}`,
        cta: "View Deal",
        ctaLink: `/deal/${deal.id}`,
      }))
    : [];

  if (loading) return <OptimizedSkeletonGrid count={6} columns={columns} className={className} />;
  if (error) return <OptimizedErrorState title="Failed to load deals" message={error} onRetry={refresh} className={className} />;
  if (items.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-[var(--t1)]">Featured Deals</h2>
        <OptimizedButton variant="ghost" size="sm" onClick={refresh}>
          <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          Refresh
        </OptimizedButton>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item, index) => (
          <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.05 }}>
            <EditorialCard data={item} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Live Stats ──
interface LiveStatsProps {
  endpoint?: string;
  className?: string;
}

export function LiveStats({ endpoint = "/api/admin/stats", className }: LiveStatsProps) {
  const { data, loading, error, refresh } = useLiveDeals<any>({ endpoint, limit: 1, autoRefresh: true, refreshInterval: 30000 });

  if (loading) {
    return (
      <div className={className}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 rounded-xl bg-[var(--s0)] border border-[var(--b1)]">
              <div className="h-3 w-16 bg-[var(--s2)] rounded animate-pulse mb-2" />
              <div className="h-6 w-20 bg-[var(--s2)] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data.length) return null;

  const stats = data[0];

  return (
    <div className={className}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[var(--s0)] border border-[var(--b1)]">
          <div className="text-xs text-[var(--t4)] mb-1">Total Deals</div>
          <div className="text-2xl font-bold text-[var(--t1)]">{stats.totalDeals?.toLocaleString() || "—"}</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--s0)] border border-[var(--b1)]">
          <div className="text-xs text-[var(--t4)] mb-1">Active Deals</div>
          <div className="text-2xl font-bold text-[var(--green)]">{stats.activeDeals?.toLocaleString() || "—"}</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--s0)] border border-[var(--b1)]">
          <div className="text-xs text-[var(--t4)] mb-1">Avg ROI</div>
          <div className="text-2xl font-bold text-[var(--amber)]">{stats.avgRoi ? `${stats.avgRoi}%` : "—"}</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--s0)] border border-[var(--b1)]">
          <div className="text-xs text-[var(--t4)] mb-1">Last Updated</div>
          <div className="text-sm font-bold text-[var(--t1)]">{stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleTimeString() : "—"}</div>
        </div>
      </div>
    </div>
  );
}

// ── Live Search ──
interface LiveSearchProps {
  endpoint?: string;
  onSelect?: (item: any) => void;
  placeholder?: string;
  className?: string;
}

export function LiveSearch({ endpoint = "/api/deals/search", onSelect, placeholder = "Search deals...", className }: LiveSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(query)}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.items || data.deals || data || []);
          setIsOpen(true);
        }
      } catch {
        // Silent fail
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, endpoint]);

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--t4)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--b1)] bg-[var(--s0)] text-[var(--t1)] placeholder:text-[var(--t5)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)] focus:border-transparent transition-all"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="w-4 h-4 animate-spin text-[var(--amber)]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isOpen && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-[var(--s0)] border border-[var(--b1)] rounded-xl shadow-xl overflow-hidden z-50"
          >
            {results.map((item: any, index: number) => (
              <button
                key={item.id || index}
                onClick={() => { onSelect?.(item); setIsOpen(false); setQuery(""); }}
                className="w-full flex items-center gap-3 p-3 hover:bg-[var(--s2)] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--s2)] overflow-hidden flex-shrink-0">
                  <img src={item.image_url || item.image || "/images/car-placeholder.jpg"} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--t1)] truncate">{item.title || `${item.year} ${item.make} ${item.model}`.trim()}</p>
                  <p className="text-xs text-[var(--t4)] truncate">{item.location_state || item.source || ""}</p>
                </div>
                {item.ask_price && <span className="text-sm font-bold text-[var(--amber)]">${item.ask_price.toLocaleString()}</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Live Filter ──
interface LiveFilterProps {
  onFilterChange?: (filters: Record<string, string>) => void;
  className?: string;
}

export function LiveFilter({ onFilterChange, className }: LiveFilterProps) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [isOpen, setIsOpen] = useState(false);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      onFilterChange?.(next);
      return next;
    });
  }, [onFilterChange]);

  return (
    <div className={cn("relative", className)}>
      <OptimizedButton variant="secondary" onClick={() => setIsOpen(!isOpen)}>
        <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
        Filters
        {Object.keys(filters).length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-[var(--amber)] text-white rounded-full">{Object.keys(filters).length}</span>
        )}
      </OptimizedButton>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full right-0 mt-2 w-64 bg-[var(--s0)] border border-[var(--b1)] rounded-xl shadow-xl p-4 z-50"
          >
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--t3)] block mb-1">Make</label>
                <select value={filters.make || ""} onChange={(e) => handleFilterChange("make", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--b1)] bg-[var(--s0)] text-[var(--t1)] text-sm">
                  <option value="">All Makes</option>
                  <option value="Porsche">Porsche</option>
                  <option value="BMW">BMW</option>
                  <option value="Audi">Audi</option>
                  <option value="Mercedes">Mercedes</option>
                  <option value="Tesla">Tesla</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--t3)] block mb-1">Max Price</label>
                <input type="number" value={filters.maxPrice || ""} onChange={(e) => handleFilterChange("maxPrice", e.target.value)} placeholder="No limit" className="w-full px-3 py-2 rounded-lg border border-[var(--b1)] bg-[var(--s0)] text-[var(--t1)] text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--t3)] block mb-1">State</label>
                <input type="text" value={filters.state || ""} onChange={(e) => handleFilterChange("state", e.target.value)} placeholder="e.g. CA, TX, FL" className="w-full px-3 py-2 rounded-lg border border-[var(--b1)] bg-[var(--s0)] text-[var(--t1)] text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <OptimizedButton variant="secondary" size="sm" className="flex-1" onClick={() => { setFilters({}); onFilterChange?.({}); }}>Clear</OptimizedButton>
                <OptimizedButton variant="primary" size="sm" className="flex-1" onClick={() => setIsOpen(false)}>Apply</OptimizedButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Live Sort ──
interface LiveSortProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function LiveSort({ value, onChange, className }: LiveSortProps) {
  const [isOpen, setIsOpen] = useState(false);

  const sortOptions = [
    { value: "newest", label: "Newest First" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
    { value: "profit_desc", label: "Highest Profit" },
    { value: "roi_desc", label: "Highest ROI" },
    { value: "mileage_asc", label: "Lowest Mileage" },
  ];

  return (
    <div className={cn("relative", className)}>
      <OptimizedButton variant="secondary" onClick={() => setIsOpen(!isOpen)}>
        <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
        </svg>
        Sort
      </OptimizedButton>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full right-0 mt-2 w-48 bg-[var(--s0)] border border-[var(--b1)] rounded-xl shadow-xl overflow-hidden z-50"
          >
            {sortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => { onChange(option.value); setIsOpen(false); }}
                className={cn("w-full px-4 py-2 text-sm text-left transition-colors", value === option.value ? "bg-[var(--amber-lo)] text-[var(--amber)] font-semibold" : "text-[var(--t2)] hover:bg-[var(--s2)]")}
              >
                {option.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Live Pagination ──
interface LivePaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function LivePagination({ currentPage, totalPages, onPageChange, className }: LivePaginationProps) {
  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  const end = Math.min(totalPages, start + maxVisible - 1);
  start = Math.max(1, end - maxVisible + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      <OptimizedButton variant="secondary" size="sm" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
      </OptimizedButton>
      {start > 1 && (<><OptimizedButton variant="ghost" size="sm" onClick={() => onPageChange(1)}>1</OptimizedButton>{start > 2 && <span className="text-[var(--t4)]">...</span>}</>)}
      {pages.map((page) => (
        <OptimizedButton key={page} variant={page === currentPage ? "primary" : "ghost"} size="sm" onClick={() => onPageChange(page)}>{page}</OptimizedButton>
      ))}
      {end < totalPages && (<>{end < totalPages - 1 && <span className="text-[var(--t4)]">...</span>}<OptimizedButton variant="ghost" size="sm" onClick={() => onPageChange(totalPages)}>{totalPages}</OptimizedButton></>)}
      <OptimizedButton variant="secondary" size="sm" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
      </OptimizedButton>
    </div>
  );
}

// ── Live View Toggle ──
interface LiveViewToggleProps {
  view: "grid" | "list" | "carousel";
  onChange: (view: "grid" | "list" | "carousel") => void;
  className?: string;
}

export function LiveViewToggle({ view, onChange, className }: LiveViewToggleProps) {
  const views = [
    { id: "grid" as const, icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
    { id: "list" as const, icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg> },
    { id: "carousel" as const, icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 8h20" /></svg> },
  ];

  return (
    <div className={cn("flex items-center gap-1 p-1 bg-[var(--s2)] rounded-lg", className)}>
      {views.map((v) => (
        <button
          key={v.id}
          onClick={() => onChange(v.id)}
          aria-label={`View as ${v.id}`}
          className={cn("p-2 rounded-md transition-all", view === v.id ? "bg-[var(--s0)] text-[var(--t1)] shadow-sm" : "text-[var(--t4)] hover:text-[var(--t2)]")}
        >
          {v.icon}
        </button>
      ))}
    </div>
  );
}

// ── Live Breadcrumb ──
interface LiveBreadcrumbProps {
  items: Array<{ label: string; href?: string }>;
  className?: string;
}

export function LiveBreadcrumb({ items, className }: LiveBreadcrumbProps) {
  return (
    <nav className={cn("flex items-center gap-2 text-sm", className)} aria-label="Breadcrumb">
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="text-[var(--t5)]">/</span>}
          {item.href ? (
            <a href={item.href} className="text-[var(--t4)] hover:text-[var(--amber)] transition-colors">{item.label}</a>
          ) : (
            <span className="text-[var(--t1)] font-semibold">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

// ── Live Section Header ──
interface LiveSectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function LiveSectionHeader({ title, subtitle, action, className }: LiveSectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-6", className)}>
      <div>
        <h2 className="text-xl font-bold text-[var(--t1)]">{title}</h2>
        {subtitle && <p className="text-sm text-[var(--t4)] mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Live Divider ──
export function LiveDivider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-[var(--b1)]", className)} />;
}

// ── Live Content Area ──
interface LiveContentAreaProps {
  children: React.ReactNode;
  className?: string;
}

export function LiveContentArea({ children, className }: LiveContentAreaProps) {
  return <div className={cn("p-4 md:p-6", className)}>{children}</div>;
}

// ── Live Page Header ──
interface LivePageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: Array<{ label: string; href?: string }>;
  actions?: React.ReactNode;
  className?: string;
}

export function LivePageHeader({ title, subtitle, breadcrumb, actions, className }: LivePageHeaderProps) {
  return (
    <div className={cn("p-4 md:p-6 border-b border-[var(--b1)] bg-[var(--s0)]", className)}>
      {breadcrumb && <LiveBreadcrumb items={breadcrumb} className="mb-3" />}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[var(--t1)]">{title}</h1>
          {subtitle && <p className="text-sm text-[var(--t4)] mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// ── Live Footer ──
interface LiveFooterProps {
  className?: string;
}

export function LiveFooter({ className }: LiveFooterProps) {
  return (
    <footer className={cn("p-4 md:p-6 border-t border-[var(--b1)] bg-[var(--s0)]", className)}>
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-sm text-[var(--t4)]">Built with Next.js, Framer Motion, and Tailwind CSS</p>
        <div className="flex items-center gap-4">
          <a href="/showcase" className="text-sm text-[var(--t4)] hover:text-[var(--amber)] transition-colors">Showcase</a>
          <a href="/tos" className="text-sm text-[var(--t4)] hover:text-[var(--amber)] transition-colors">Terms</a>
          <a href="/privacy" className="text-sm text-[var(--t4)] hover:text-[var(--amber)] transition-colors">Privacy</a>
        </div>
      </div>
    </footer>
  );
}

// ── Live Layout ──
interface LiveLayoutProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  sidebar?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function LiveLayout({ children, header, sidebar, footer, className }: LiveLayoutProps) {
  return (
    <div className={cn("min-h-screen bg-[var(--s1)]", className)}>
      {header}
      <div className="flex">
        {sidebar && <aside className="w-64 flex-shrink-0 border-r border-[var(--b1)] bg-[var(--s0)]">{sidebar}</aside>}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      {footer}
    </div>
  );
}

// ── Live Sidebar ──
interface LiveSidebarProps {
  items: Array<{ id: string; label: string; icon?: React.ReactNode; href?: string; active?: boolean; badge?: string | number }>;
  onItemClick?: (id: string) => void;
  className?: string;
}

export function LiveSidebar({ items, onItemClick, className }: LiveSidebarProps) {
  return (
    <nav className={cn("p-4 space-y-1", className)}>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onItemClick?.(item.id)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left",
            item.active ? "bg-[var(--amber-lo)] text-[var(--amber)]" : "text-[var(--t3)] hover:bg-[var(--s2)] hover:text-[var(--t1)]"
          )}
        >
          {item.icon}
          <span className="flex-1">{item.label}</span>
          {item.badge != null && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[var(--s3)] text-[var(--t3)] rounded-full">{item.badge}</span>}
        </button>
      ))}
    </nav>
  );
}

// ── Live Header ──
interface LiveHeaderProps {
  title: string;
  logo?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function LiveHeader({ title, logo, actions, className }: LiveHeaderProps) {
  return (
    <header className={cn("h-14 border-b border-[var(--b1)] bg-[var(--s0)] flex items-center justify-between px-4", className)}>
      <div className="flex items-center gap-3">
        {logo}
        <span className="text-lg font-bold text-[var(--t1)]">{title}</span>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

// ── Live Container ──
interface LiveContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function LiveContainer({ children, className }: LiveContainerProps) {
  return <div className={cn("max-w-7xl mx-auto", className)}>{children}</div>;
}

// ── Live Grid ──
interface LiveGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  gap?: number;
  className?: string;
}

export function LiveGrid({ children, columns = 3, gap = 16, className }: LiveGridProps) {
  return (
    <div className={cn("grid", className)} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: `${gap}px` }}>
      {children}
    </div>
  );
}

// ── Live Badge ──
interface LiveBadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info";
  className?: string;
}

export function LiveBadge({ children, variant = "default", className }: LiveBadgeProps) {
  const variants = {
    default: "bg-[var(--s2)] text-[var(--t2)]",
    success: "bg-[var(--glo)] text-[var(--green)]",
    warning: "bg-[var(--olo)] text-[var(--orange)]",
    error: "bg-[var(--rlo)] text-[var(--red)]",
    info: "bg-[var(--blo)] text-[var(--blue)]",
  };
  return <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold", variants[variant], className)}>{children}</span>;
}

// ── Live Progress ──
interface LiveProgressProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
}

export function LiveProgress({ value, max = 100, className, showLabel = false }: LiveProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-xs font-medium text-[var(--t4)]">Progress</span>
          <span className="text-xs font-medium text-[var(--t4)]">{Math.round(percentage)}%</span>
        </div>
      )}
      <div className="h-2 bg-[var(--s2)] rounded-full overflow-hidden">
        <motion.div className="h-full bg-[var(--grad)] rounded-full" initial={{ width: 0 }} animate={{ width: `${percentage}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
      </div>
    </div>
  );
}

// ── Live Rating ──
interface LiveRatingProps {
  value: number;
  onChange?: (value: number) => void;
  max?: number;
  size?: number;
  className?: string;
}

export function LiveRating({ value, onChange, max = 5, size = 20, className }: LiveRatingProps) {
  return (
    <div className={cn("flex gap-1", className)}>
      {Array.from({ length: max }).map((_, i) => (
        <svg
          key={i}
          className={cn("transition-colors", i < value ? "text-[var(--gold)]" : "text-[var(--s4)]")}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={i < value ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          onClick={() => onChange?.(i + 1)}
          style={{ cursor: onChange ? "pointer" : "default" }}
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

// ── Live Toggle ──
interface LiveToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}

export function LiveToggle({ checked, onChange, label, className }: LiveToggleProps) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className={cn("relative w-11 h-6 rounded-full transition-colors", checked ? "bg-[var(--grad)]" : "bg-[var(--s4)]", className)} onClick={() => onChange(!checked)}>
      <div className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
    </button>
  );
}

// ── Live Accordion ──
interface LiveAccordionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function LiveAccordion({ title, children, defaultOpen = false, className }: LiveAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-xl border border-[var(--b1)] overflow-hidden", className)}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 bg-[var(--s0)] hover:bg-[var(--s2)] transition-colors" aria-expanded={open}>
        <h4 className="text-sm font-semibold text-[var(--t1)]">{title}</h4>
        <svg className={cn("w-5 h-5 text-[var(--t4)] transition-transform", open && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="p-4 bg-[var(--s0)] border-t border-[var(--b1)]">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Live Tabs ──
interface LiveTabsProps {
  tabs: Array<{ id: string; label: string; icon?: React.ReactNode }>;
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function LiveTabs({ tabs, activeTab, onChange, className }: LiveTabsProps) {
  return (
    <div className={cn("flex gap-1 p-1 bg-[var(--s2)] rounded-xl", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn("flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all", activeTab === tab.id ? "bg-[var(--s0)] text-[var(--t1)] shadow-sm" : "text-[var(--t4)] hover:text-[var(--t2)]")}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Live Modal ──
interface LiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export function LiveModal({ isOpen, onClose, children, title, className }: LiveModalProps) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <motion.div className={cn("fixed inset-0 z-[100] flex items-center justify-center p-4", className)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        className={cn("relative w-full max-w-lg bg-[var(--s0)] rounded-[var(--r4)] shadow-2xl", className)}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-[var(--b1)]">
            <h3 className="text-lg font-bold text-[var(--t1)]">{title}</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-[var(--s2)] flex items-center justify-center text-[var(--t4)] hover:bg-[var(--s3)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        <div className="p-4">{children}</div>
      </motion.div>
    </motion.div>
  );
}

// ── Live Toast ──
interface LiveToastProps {
  message: string;
  type?: "success" | "error" | "info" | "warning";
  duration?: number;
  onClose?: () => void;
}

export function LiveToast({ message, type = "info", duration = 3000, onClose }: LiveToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => { setVisible(false); onClose?.(); }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  const icons = {
    success: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>,
    error: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></svg>,
    info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>,
    warning: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01" /><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>,
  };

  const colors = { success: "var(--green)", error: "var(--red)", info: "var(--blue)", warning: "var(--orange)" };

  return (
    <motion.div
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[200] p-4 rounded-xl bg-[var(--s0)] shadow-xl border border-[var(--b1)]"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
    >
      <div className="flex items-center gap-3">
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", colors[type])}>{icons[type]}</div>
        <p className="flex-1 text-sm font-medium text-[var(--t1)]">{message}</p>
      </div>
    </motion.div>
  );
}

// ── Live Skeleton ──
interface LiveSkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
}

export function LiveSkeleton({ className, variant = "text", width, height }: LiveSkeletonProps) {
  const variants = { text: "h-4 rounded", circular: "rounded-full", rectangular: "rounded-xl" };
  return <div className={cn("bg-[var(--s2)] animate-pulse", variants[variant], className)} style={{ width, height }} />;
}

// ── Live Skeleton Card ──
export function LiveSkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-[var(--r4)] overflow-hidden bg-[var(--s0)] border border-[var(--b1)]", className)}>
      <div className="aspect-[4/3] bg-[var(--s2)] animate-pulse" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-[var(--s2)] rounded animate-pulse" style={{ width: "60%" }} />
        <div className="h-3 bg-[var(--s2)] rounded animate-pulse" style={{ width: "40%" }} />
        <div className="h-3 bg-[var(--s2)] rounded animate-pulse" style={{ width: "80%" }} />
      </div>
    </div>
  );
}

// ── Live Skeleton Grid ──
export function LiveSkeletonGrid({ count = 6, columns = 3, className }: { count?: number; columns?: 2 | 3 | 4; className?: string }) {
  return (
    <div className={cn("grid gap-4", className)} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {Array.from({ length: count }).map((_, i) => <LiveSkeletonCard key={i} />)}
    </div>
  );
}

// ── Live Empty State ──
interface LiveEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function LiveEmptyState({ icon, title, description, action, className }: LiveEmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}>
      {icon && <div className="w-16 h-16 rounded-full bg-[var(--s2)] flex items-center justify-center mb-4 text-[var(--t4)]">{icon}</div>}
      <h3 className="text-lg font-bold text-[var(--t1)] mb-2">{title}</h3>
      {description && <p className="text-sm text-[var(--t4)] max-w-sm mb-4">{description}</p>}
      {action}
    </div>
  );
}

// ── Live Error State ──
interface LiveErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function LiveErrorState({ title = "Something went wrong", message = "Please try again.", onRetry, className }: LiveErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}>
      <div className="w-16 h-16 rounded-full bg-[var(--rlo)] flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-[var(--red)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-bold text-[var(--t1)] mb-2">{title}</h3>
      <p className="text-sm text-[var(--t4)] max-w-sm mb-4">{message}</p>
      {onRetry && <OptimizedButton onClick={onRetry} variant="primary">Try Again</OptimizedButton>}
    </div>
  );
}

// ── Live Spinner ──
interface LiveSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LiveSpinner({ size = "md", className }: LiveSpinnerProps) {
  const sizes = { sm: "w-4 h-4", md: "w-8 h-8", lg: "w-12 h-12" };
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <svg className={cn("animate-spin text-[var(--amber)]", sizes[size])} viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}

// ── Live Tooltip ──
interface LiveTooltipProps {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
}

export function LiveTooltip({ content, children, position = "top" }: LiveTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div className="relative inline-block" onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)}>
      {children}
      {isVisible && (
        <motion.div
          className={cn("absolute z-50 px-3 py-1.5 text-xs font-medium text-white bg-[var(--t1)] rounded-lg whitespace-nowrap", positions[position])}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
        >
          {content}
        </motion.div>
      )}
    </div>
  );
}

// ── Live Image Gallery ──
interface LiveImageGalleryProps {
  images: Array<{ src: string; alt: string }>;
  columns?: 2 | 3 | 4;
  gap?: number;
  onImageClick?: (index: number) => void;
}

export function LiveImageGallery({ images, columns = 3, gap = 16, onImageClick }: LiveImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleImageClick = (index: number) => {
    setSelectedIndex(index);
    onImageClick?.(index);
  };

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: `${gap}px` }}>
        {images.map((image, index) => (
          <motion.div key={index} className="relative aspect-square rounded-xl overflow-hidden cursor-pointer" onClick={() => handleImageClick(index)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <img src={image.src} alt={image.alt} className="w-full h-full object-cover" loading="lazy" />
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {selectedIndex !== null && (
          <motion.div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedIndex(null)}>
            <motion.img src={images[selectedIndex].src} alt={images[selectedIndex].alt} className="max-w-full max-h-full object-contain rounded-lg" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} />
            <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20" onClick={() => setSelectedIndex(null)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Live FAB ──
interface LiveFABProps {
  icon: React.ReactNode;
  onClick: () => void;
  label?: string;
  className?: string;
}

export function LiveFAB({ icon, onClick, label, className }: LiveFABProps) {
  return (
    <button onClick={onClick} aria-label={label} className={cn("fixed bottom-20 right-4 w-14 h-14 rounded-full bg-[var(--grad)] text-white flex items-center justify-center shadow-lg z-[80] hover:opacity-90 active:scale-95 transition-all", className)}>
      {icon}
    </button>
  );
}

// ── Live Speed Dial ──
interface LiveSpeedDialProps {
  mainIcon: React.ReactNode;
  actions: Array<{ icon: React.ReactNode; label: string; onClick: () => void }>;
  className?: string;
}

export function LiveSpeedDial({ mainIcon, actions, className }: LiveSpeedDialProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("fixed bottom-20 right-4 z-[80]", className)}>
      <div className={cn("flex flex-col-reverse gap-2 mb-2 transition-all", open ? "opacity-100" : "opacity-0 pointer-events-none")}>
        {actions.map((action, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="px-2 py-1 rounded-lg bg-[var(--s0)] text-xs font-semibold text-[var(--t2)] shadow">{action.label}</span>
            <button onClick={() => { action.onClick(); setOpen(false); }} className="w-10 h-10 rounded-full bg-[var(--s0)] text-[var(--t3)] flex items-center justify-center shadow hover:bg-[var(--s2)]">{action.icon}</button>
          </div>
        ))}
      </div>
      <button onClick={() => setOpen(!open)} className="w-14 h-14 rounded-full bg-[var(--grad)] text-white flex items-center justify-center shadow-lg hover:opacity-90 active:scale-95 transition-all" aria-label={open ? "Close menu" : "Open menu"}>
        {mainIcon}
      </button>
    </div>
  );
}

// ── Live Quick Actions ──
interface LiveQuickActionsProps {
  actions: Array<{ icon: React.ReactNode; label: string; onClick: () => void }>;
  className?: string;
}

export function LiveQuickActions({ actions, className }: LiveQuickActionsProps) {
  return (
    <div className={cn("fixed bottom-24 right-4 flex flex-col gap-3 z-[80]", className)}>
      {actions.map((action, i) => (
        <button key={i} onClick={action.onClick} className="w-12 h-12 rounded-full bg-[var(--s0)] shadow-lg flex items-center justify-center text-[var(--t3)] hover:bg-[var(--s2)] transition-colors" aria-label={action.label}>
          {action.icon}
        </button>
      ))}
    </div>
  );
}

// ── Live Bulk Actions ──
interface LiveBulkActionsProps {
  selectedCount: number;
  actions: Array<{ label: string; variant?: "primary" | "secondary" | "destructive"; onClick: () => void }>;
  onClear: () => void;
  className?: string;
}

export function LiveBulkActions({ selectedCount, actions, onClear, className }: LiveBulkActionsProps) {
  return (
    <div className={cn("fixed bottom-20 left-4 right-4 p-3 rounded-xl bg-[var(--s0)] shadow-xl z-[70] flex items-center gap-3", className)}>
      <span className="text-sm font-semibold text-[var(--t1)]">{selectedCount} selected</span>
      <div className="flex-1" />
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={action.onClick}
          className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors", action.variant === "primary" && "bg-[var(--grad)] text-white", action.variant === "secondary" && "bg-[var(--s2)] text-[var(--t2)]", action.variant === "destructive" && "bg-[var(--red)] text-white", !action.variant && "bg-[var(--grad)] text-white")}
        >
          {action.label}
        </button>
      ))}
      <button onClick={onClear} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--s2)] text-[var(--t2)]">Clear</button>
    </div>
  );
}

// ── Live Context Bar ──
interface LiveContextBarProps {
  title: string;
  subtitle?: string;
  actions: Array<{ icon: React.ReactNode; label: string; onClick: () => void; variant?: "save" | "share" | "more" }>;
  className?: string;
}

export function LiveContextBar({ title, subtitle, actions, className }: LiveContextBarProps) {
  return (
    <div className={cn("fixed bottom-20 left-4 right-4 p-3 rounded-xl bg-[var(--s0)] shadow-xl z-[70] flex items-center gap-3", className)}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[var(--t1)] truncate">{title}</p>
        {subtitle && <p className="text-xs text-[var(--t4)] truncate">{subtitle}</p>}
      </div>
      <div className="flex gap-2">
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            className={cn("w-10 h-10 rounded-full flex items-center justify-center transition-colors", action.variant === "save" && "bg-[var(--amber-lo)] text-[var(--amber)]", action.variant === "share" && "bg-[var(--blo)] text-[var(--blue)]", (!action.variant || action.variant === "more") && "bg-[var(--s2)] text-[var(--t3)]")}
            aria-label={action.label}
          >
            {action.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Live Filter Bar ──
interface LiveFilterBarProps {
  filters: Array<{ label: string; value: string; active?: boolean; icon?: React.ReactNode }>;
  onFilterChange: (value: string) => void;
  resultCount?: number;
  sortLabel?: string;
  onSortClick?: () => void;
  className?: string;
}

export function LiveFilterBar({ filters, onFilterChange, resultCount, sortLabel, onSortClick, className }: LiveFilterBarProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {filters.map((filter) => (
          <button
            key={filter.value}
            onClick={() => onFilterChange(filter.value)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all", filter.active ? "bg-[var(--grad)] text-white" : "bg-[var(--s0)] text-[var(--t3)] border border-[var(--b1)] hover:border-[var(--amber)]")}
          >
            {filter.icon}
            {filter.label}
          </button>
        ))}
      </div>
      {(resultCount !== undefined || sortLabel) && (
        <div className="flex items-center justify-between">
          {resultCount !== undefined && <span className="text-xs text-[var(--t4)]">{resultCount} results</span>}
          {sortLabel && (
            <button onClick={onSortClick} className="flex items-center gap-1 text-xs font-semibold text-[var(--t3)]">
              {sortLabel}
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 15l5 5 5-5M7 9l5-5 5 5" /></svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Live Search Header ──
interface LiveSearchHeaderProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
  autoFocus?: boolean;
  className?: string;
}

export function LiveSearchHeader({ value, onChange, placeholder = "Search...", onClear, autoFocus, className }: LiveSearchHeaderProps) {
  return (
    <div className={cn("relative", className)}>
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--t4)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[var(--b1)] bg-[var(--s0)] text-[var(--t1)] placeholder:text-[var(--t5)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)] focus:border-transparent transition-all"
      />
      {value && (
        <button onClick={onClear} className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--s3)] flex items-center justify-center text-[var(--t4)] hover:bg-[var(--s4)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
}

// ── Live Sticky Top Bar ──
interface LiveStickyTopBarProps {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  className?: string;
}

export function LiveStickyTopBar({ title, onBack, rightAction, className }: LiveStickyTopBarProps) {
  return (
    <div className={cn("sticky top-0 z-50 flex items-center gap-3 p-3 bg-[var(--s0)] border-b border-[var(--b1)]", className)}>
      {onBack && (
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-[var(--s2)] flex items-center justify-center text-[var(--t3)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
      )}
      <span className="flex-1 text-base font-bold text-[var(--t1)] truncate">{title}</span>
      {rightAction}
    </div>
  );
}

// ── Live Search Bar ──
interface LiveSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
  autoFocus?: boolean;
  className?: string;
}

export function LiveSearchBar({ value, onChange, placeholder = "Search...", onClear, autoFocus, className }: LiveSearchBarProps) {
  return (
    <div className={cn("relative", className)}>
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--t4)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[var(--b1)] bg-[var(--s0)] text-[var(--t1)] placeholder:text-[var(--t5)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)] focus:border-transparent transition-all"
      />
      {value && (
        <button onClick={onClear} className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--s3)] flex items-center justify-center text-[var(--t4)] hover:bg-[var(--s4)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
}

// ── Live Filter Chips ──
interface LiveFilterChipsProps {
  options: Array<{ label: string; value: string; active?: boolean }>;
  onChange: (value: string) => void;
  multiSelect?: boolean;
  className?: string;
}

export function LiveFilterChips({ options, onChange, multiSelect = false, className }: LiveFilterChipsProps) {
  const [selected, setSelected] = useState<string[]>(options.filter((o) => o.active).map((o) => o.value));

  const handleClick = (value: string) => {
    if (multiSelect) {
      const newSelected = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
      setSelected(newSelected);
      onChange(newSelected.join(","));
    } else {
      setSelected([value]);
      onChange(value);
    }
  };

  return (
    <div className={cn("flex gap-2 overflow-x-auto pb-2 scrollbar-hide", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => handleClick(option.value)}
          className={cn("px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all", selected.includes(option.value) ? "bg-[var(--grad)] text-white" : "bg-[var(--s0)] text-[var(--t3)] border border-[var(--b1)] hover:border-[var(--amber)]")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ── Live Segmented Control ──
interface LiveSegmentedControlProps {
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function LiveSegmentedControl({ options, value, onChange, className }: LiveSegmentedControlProps) {
  return (
    <div className={cn("flex p-0.5 bg-[var(--s2)] rounded-lg", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn("flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all", value === option.value ? "bg-[var(--s0)] text-[var(--t1)] shadow-sm" : "text-[var(--t4)] hover:text-[var(--t2)]")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ── Live Infinite Scroll ──
interface LiveInfiniteScrollProps {
  children: React.ReactNode;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  threshold?: number;
  className?: string;
}

export function LiveInfiniteScroll({ children, hasMore, isLoading, onLoadMore, threshold = 200, className }: LiveInfiniteScrollProps) {
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && hasMore && !isLoading) onLoadMore(); }, { rootMargin: `${threshold}px` });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoadMore, threshold]);

  return (
    <div className={className}>
      {children}
      <div ref={sentinelRef} className="h-1" />
      {isLoading && (
        <div className="flex items-center justify-center py-6 gap-2 text-[var(--t4)] text-sm">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading more...
        </div>
      )}
      {!hasMore && !isLoading && (
        <div className="flex items-center justify-center py-6 text-[var(--t5)] text-sm">You've reached the end</div>
      )}
    </div>
  );
}

// ── Live Sticky Bottom Bar ──
interface LiveStickyBottomBarProps {
  children: React.ReactNode;
  className?: string;
}

export function LiveStickyBottomBar({ children, className }: LiveStickyBottomBarProps) {
  return <div className={cn("fixed bottom-0 left-0 right-0 p-3 bg-[var(--s0)] border-t border-[var(--b1)] z-50", className)}>{children}</div>;
}

// ── Live Confirmation Dialog ──
interface LiveConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  className?: string;
}

export function LiveConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", destructive = false, className }: LiveConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className={cn("fixed inset-0 z-[100] flex items-center justify-center p-4", className)}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[var(--s0)] rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-bold text-[var(--t1)] mb-2">{title}</h3>
        {message && <p className="text-sm text-[var(--t4)] mb-4">{message}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[var(--s2)] text-[var(--t2)] text-sm font-bold">{cancelLabel}</button>
          <button onClick={() => { onConfirm(); onClose(); }} className={cn("flex-1 py-2.5 rounded-xl text-white text-sm font-bold", destructive ? "bg-[var(--red)]" : "bg-[var(--grad)]")}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Live Date Picker ──
interface LiveDatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (date: Date) => void;
  selectedDate?: Date;
  className?: string;
}

export function LiveDatePicker({ isOpen, onClose, onSelect, selectedDate, className }: LiveDatePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate || new Date());
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  if (!isOpen) return null;

  return (
    <div className={cn("fixed inset-0 z-[100] flex items-end md:items-center justify-center", className)}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[var(--s0)] rounded-t-2xl md:rounded-2xl shadow-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="w-8 h-8 rounded-lg bg-[var(--s2)] flex items-center justify-center text-[var(--t3)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <span className="text-sm font-bold text-[var(--t1)]">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
          <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="w-8 h-8 rounded-lg bg-[var(--s2)] flex items-center justify-center text-[var(--t3)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dayNames.map((d) => <div key={d} className="text-center text-[10px] font-bold text-[var(--t5)] py-1">{d}</div>)}
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isSelected = selectedDate && selectedDate.getDate() === day && selectedDate.getMonth() === currentMonth.getMonth() && selectedDate.getFullYear() === currentMonth.getFullYear();
            return (
              <button
                key={day}
                onClick={() => { onSelect(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)); onClose(); }}
                className={cn("w-8 h-8 rounded-lg text-sm font-medium", isSelected ? "bg-[var(--grad)] text-white" : "text-[var(--t2)] hover:bg-[var(--s2)]")}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Live Time Picker ──
interface LiveTimePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (hours: number, minutes: number) => void;
  initialHours?: number;
  initialMinutes?: number;
  className?: string;
}

export function LiveTimePicker({ isOpen, onClose, onSelect, initialHours = 12, initialMinutes = 0, className }: LiveTimePickerProps) {
  const [hours, setHours] = useState(initialHours);
  const [minutes, setMinutes] = useState(initialMinutes);

  if (!isOpen) return null;

  return (
    <div className={cn("fixed inset-0 z-[100] flex items-end md:items-center justify-center", className)}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[var(--s0)] rounded-t-2xl md:rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-bold text-[var(--t1)] text-center mb-6">Select Time</h3>
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <div className="text-4xl font-bold text-[var(--t1)]">{String(hours).padStart(2, "0")}</div>
            <div className="text-xs text-[var(--t4)] mt-1">Hours</div>
          </div>
          <div className="text-3xl font-bold text-[var(--t4)]">:</div>
          <div className="text-center">
            <div className="text-4xl font-bold text-[var(--t1)]">{String(minutes).padStart(2, "0")}</div>
            <div className="text-xs text-[var(--t4)] mt-1">Minutes</div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[var(--s2)] text-[var(--t2)] text-sm font-bold">Cancel</button>
          <button onClick={() => { onSelect(hours, minutes); onClose(); }} className="flex-1 py-2.5 rounded-xl bg-[var(--grad)] text-white text-sm font-bold">Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Live Color Picker ──
interface LiveColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  colors?: string[];
  className?: string;
}

export function LiveColorPicker({ value, onChange, colors = ["#f25b9a", "#ff7a4d", "#9b6bff", "#5b9bef", "#00ff66", "#ff385c"], className }: LiveColorPickerProps) {
  return (
    <div className={cn("flex gap-2", className)}>
      {colors.map((color) => (
        <button
          key={color}
          onClick={() => onChange(color)}
          className={cn("w-8 h-8 rounded-full transition-all", value === color ? "ring-2 ring-offset-2 ring-[var(--t1)]" : "hover:scale-110")}
          style={{ backgroundColor: color }}
          aria-label={`Select color ${color}`}
        />
      ))}
    </div>
  );
}
