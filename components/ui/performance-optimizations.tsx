"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// ── Image Optimizer ──
interface ImageOptimizerProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  quality?: number;
  className?: string;
  priority?: boolean;
}

export function ImageOptimizer({ src, alt, width, height, quality = 80, className, priority = false }: ImageOptimizerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, []);

  // Build optimized URL (assuming Next.js image optimization or similar)
  const optimizedSrc = src; // In production, use your image optimization service

  return (
    <div ref={imgRef} className={cn("relative overflow-hidden", className)} style={{ aspectRatio: width && height ? `${width}/${height}` : undefined }}>
      {!isLoaded && (
        <div className="absolute inset-0 bg-[var(--s2)] animate-pulse flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--s4)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </div>
      )}
      {isInView && (
        <img
          src={optimizedSrc}
          alt={alt}
          width={width}
          height={height}
          className={cn("w-full h-full object-cover transition-opacity duration-500", isLoaded ? "opacity-100" : "opacity-0")}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setIsLoaded(true)}
        />
      )}
    </div>
  );
}

// ── Virtual List ──
interface VirtualListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string;
  itemHeight: number;
  overscan?: number;
  className?: string;
}

export function VirtualList<T>({ items, renderItem, keyExtractor, itemHeight, overscan = 5, className }: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      setContainerHeight(entry.contentRect.height);
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(items.length, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan);
  const visibleItems = items.slice(startIndex, endIndex);
  const totalHeight = items.length * itemHeight;
  const offsetY = startIndex * itemHeight;

  return (
    <div ref={containerRef} className={cn("overflow-y-auto", className)} onScroll={handleScroll}>
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => (
            <div key={keyExtractor(item)} style={{ height: itemHeight }}>
              {renderItem(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Debounced Value ──
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ── Throttled Callback ──
export function useThrottledCallback<T extends (...args: any[]) => any>(callback: T, delay: number): T {
  const lastRan = useRef(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout>();

  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastRun = now - lastRan.current;

    if (timeSinceLastRun >= delay) {
      lastRan.current = now;
      callback(...args);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        lastRan.current = Date.now();
        callback(...args);
      }, delay - timeSinceLastRun);
    }
  }, [callback, delay]) as T;
}

// ── Memoized Component ──
interface MemoizedComponentProps {
  children: React.ReactNode;
  deps: any[];
}

export function MemoizedComponent({ children, deps }: MemoizedComponentProps) {
  const memoizedChildren = React.useMemo(() => children, deps);
  return <>{memoizedChildren}</>;
}

// ── Lazy Component ──
interface LazyComponentProps {
  loader: () => Promise<{ default: React.ComponentType<any> }>;
  fallback?: React.ReactNode;
  [key: string]: any;
}

export function LazyComponent({ loader, fallback = null, ...props }: LazyComponentProps) {
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    let mounted = true;
    loader().then((module) => {
      if (mounted) setComponent(() => module.default);
    });
    return () => { mounted = false; };
  }, [loader]);

  if (!Component) return <>{fallback}</>;
  return <Component {...props} />;
}

// ── Intersection Observer Hook ──
interface UseIntersectionObserverOptions {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

export function useIntersectionObserver(
  elementRef: React.RefObject<Element>,
  options: UseIntersectionObserverOptions = {}
) {
  const { threshold = 0.1, rootMargin = "0px", once = true } = options;
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setIsIntersecting(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef, threshold, rootMargin, once]);

  return isIntersecting;
}

// ── Media Query Hook ──
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

// ── Reduced Motion Hook ──
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return prefersReducedMotion;
}

// ── Network Status Hook ──
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [connectionType, setConnectionType] = useState<string>("unknown");

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const connection = (navigator as any).connection;
    const handleChange = () => {
      if (connection) setConnectionType(connection.effectiveType);
    };
    if (connection) {
      setConnectionType(connection.effectiveType);
      connection.addEventListener("change", handleChange);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      connection?.removeEventListener("change", handleChange);
    };
  }, []);

  return { isOnline, connectionType };
}

// ── Battery Status Hook ──
export function useBatteryStatus() {
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);

  useEffect(() => {
    const getBattery = async () => {
      try {
        const battery = await (navigator as any).getBattery();
        setBattery({ level: battery.level, charging: battery.charging });

        const handleLevelChange = () => setBattery((prev) => prev ? { ...prev, level: battery.level } : null);
        const handleChargingChange = () => setBattery((prev) => prev ? { ...prev, charging: battery.charging } : null);

        battery.addEventListener("levelchange", handleLevelChange);
        battery.addEventListener("chargingchange", handleChargingChange);
      } catch {
        // Battery API not supported
      }
    };
    getBattery();
  }, []);

  return battery;
}

// ── Geolocation Hook ──
export function useGeolocation() {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setError(null);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  return { location, error, requestLocation };
}

// ── Clipboard Hook ──
export function useClipboard() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  return { copied, copy };
}

// ── Fullscreen Hook ──
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const enter = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } catch {
      // Fullscreen not supported
    }
  }, []);

  const exit = useCallback(async () => {
    try {
      await document.exitFullscreen();
      setIsFullscreen(false);
    } catch {
      // Fullscreen not supported
    }
  }, []);

  const toggle = useCallback(() => {
    if (isFullscreen) exit();
    else enter();
  }, [isFullscreen, enter, exit]);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  return { isFullscreen, enter, exit, toggle };
}

// ── Wake Lock Hook ──
export function useWakeLock() {
  const [isLocked, setIsLocked] = useState(false);
  const wakeLockRef = useRef<any>(null);

  const request = useCallback(async () => {
    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      setIsLocked(true);
      wakeLockRef.current.addEventListener("release", () => setIsLocked(false));
    } catch {
      // Wake Lock not supported
    }
  }, []);

  const release = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        setIsLocked(false);
      }
    } catch {
      // Wake Lock not supported
    }
  }, []);

  useEffect(() => {
    return () => {
      if (wakeLockRef.current) wakeLockRef.current.release();
    };
  }, []);

  return { isLocked, request, release };
}

// ── Performance Monitor ──
interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  droppedFrames: number;
}

export function usePerformanceMonitor() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({ fps: 0, frameTime: 0, droppedFrames: 0 });

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationId: number;

    const measure = (currentTime: number) => {
      frameCount++;
      const delta = currentTime - lastTime;
      if (delta >= 1000) {
        const fps = Math.round((frameCount * 1000) / delta);
        const frameTime = delta / frameCount;
        const droppedFrames = Math.max(0, Math.round(60 - fps));
        setMetrics({ fps, frameTime, droppedFrames });
        frameCount = 0;
        lastTime = currentTime;
      }
      animationId = requestAnimationFrame(measure);
    };

    animationId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(animationId);
  }, []);

  return metrics;
}

// ── Memory Usage ──
export function useMemoryUsage() {
  const [memory, setMemory] = useState<{ usedJSHeapSize: number; totalJSHeapSize: number } | null>(null);

  useEffect(() => {
    const updateMemory = () => {
      const perf = performance as any;
      if (perf.memory) {
        setMemory({
          usedJSHeapSize: perf.memory.usedJSHeapSize,
          totalJSHeapSize: perf.memory.totalJSHeapSize,
        });
      }
    };

    updateMemory();
    const interval = setInterval(updateMemory, 5000);
    return () => clearInterval(interval);
  }, []);

  return memory;
}

// ── Navigation Timing ──
export function useNavigationTiming() {
  const [timing, setTiming] = useState<PerformanceNavigationTiming | null>(null);

  useEffect(() => {
    const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (entries.length > 0) setTiming(entries[entries.length - 1]);
  }, []);

  return timing;
}

// ── Resource Timing ──
export function useResourceTiming() {
  const [resources, setResources] = useState<PerformanceResourceTiming[]>([]);

  useEffect(() => {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    setResources(entries);
  }, []);

  return resources;
}

// ── Long Tasks ──
export function useLongTasks() {
  const [longTasks, setLongTasks] = useState<PerformanceEntry[]>([]);

  useEffect(() => {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      setLongTasks((prev) => [...prev, ...entries]);
    });

    observer.observe({ entryTypes: ["longtask"] });
    return () => observer.disconnect();
  }, []);

  return longTasks;
}

// ── Layout Shifts ──
export function useLayoutShifts() {
  const [shifts, setShifts] = useState<PerformanceEntry[]>([]);

  useEffect(() => {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      setShifts((prev) => [...prev, ...entries]);
    });

    observer.observe({ entryTypes: ["layout-shift"] });
    return () => observer.disconnect();
  }, []);

  return shifts;
}

// ── First Input Delay ──
export function useFirstInputDelay() {
  const [delay, setDelay] = useState<number | null>(null);

  useEffect(() => {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length > 0) setDelay(entries[0].duration);
    });

    observer.observe({ entryTypes: ["first-input"] });
    return () => observer.disconnect();
  }, []);

  return delay;
}

// ── Largest Contentful Paint ──
export function useLCP() {
  const [lcp, setLcp] = useState<PerformanceEntry | null>(null);

  useEffect(() => {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length > 0) setLcp(entries[entries.length - 1]);
    });

    observer.observe({ entryTypes: ["largest-contentful-paint"] });
    return () => observer.disconnect();
  }, []);

  return lcp;
}

// ── First Contentful Paint ──
export function useFCP() {
  const [fcp, setFcp] = useState<PerformanceEntry | null>(null);

  useEffect(() => {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length > 0) setFcp(entries[entries.length - 1]);
    });

    observer.observe({ entryTypes: ["paint"] });
    return () => observer.disconnect();
  }, []);

  return fcp;
}

// ── Time to First Byte ──
export function useTTFB() {
  const [ttfb, setTtfb] = useState<number | null>(null);

  useEffect(() => {
    const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (entries.length > 0) setTtfb(entries[0].responseStart);
  }, []);

  return ttfb;
}

// ── DOM Content Loaded ──
export function useDCL() {
  const [dcl, setDcl] = useState<number | null>(null);

  useEffect(() => {
    const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (entries.length > 0) setDcl(entries[0].domContentLoadedEventEnd);
  }, []);

  return dcl;
}

// ── Load Event ──
export function useLoadEvent() {
  const [loadTime, setLoadTime] = useState<number | null>(null);

  useEffect(() => {
    const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (entries.length > 0) setLoadTime(entries[0].loadEventEnd);
  }, []);

  return loadTime;
}

// ── Custom Performance Marks ──
export function usePerformanceMark(name: string) {
  useEffect(() => {
    performance.mark(name);
  }, [name]);
}

// ── Custom Performance Measures ──
export function usePerformanceMeasure(name: string, startMark: string, endMark: string) {
  useEffect(() => {
    try {
      performance.measure(name, startMark, endMark);
    } catch {
      // Marks not found
    }
  }, [name, startMark, endMark]);
}

// ── Performance Observer ──
export function usePerformanceObserver(entryTypes: string[], callback: (entries: PerformanceEntry[]) => void) {
  useEffect(() => {
    const observer = new PerformanceObserver((list) => callback(list.getEntries()));
    observer.observe({ entryTypes });
    return () => observer.disconnect();
  }, [entryTypes, callback]);
}

// ── Performance Budget ──
export function usePerformanceBudget(budgets: Record<string, number>) {
  const [violations, setViolations] = useState<Record<string, number>>({});

  useEffect(() => {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        const budget = budgets[entry.entryType];
        if (budget && entry.duration > budget) {
          setViolations((prev) => ({ ...prev, [entry.entryType]: entry.duration }));
        }
      });
    });

    observer.observe({ entryTypes: Object.keys(budgets) });
    return () => observer.disconnect();
  }, [budgets]);

  return violations;
}

// ── Performance Summary ──
export function usePerformanceSummary() {
  const navigation = useNavigationTiming();
  const lcp = useLCP();
  const fcp = useFCP();
  const ttfb = useTTFB();
  const dcl = useDCL();
  const load = useLoadEvent();
  const longTasks = useLongTasks();
  const shifts = useLayoutShifts();
  const firstInput = useFirstInputDelay();
  const memory = useMemoryUsage();

  return { navigation, lcp, fcp, ttfb, dcl, load, longTasks, shifts, firstInput, memory };
}

// ── Performance Dashboard ──
interface PerformanceDashboardProps {
  className?: string;
}

export function PerformanceDashboard({ className }: PerformanceDashboardProps) {
  const metrics = usePerformanceSummary();
  const [isExpanded, setIsExpanded] = useState(false);

  const formatTime = (ms: number | null) => ms != null ? `${Math.round(ms)}ms` : "—";
  const formatBytes = (bytes: number | null) => {
    if (bytes == null) return "—";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className={cn("glass-panel p-4", className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-sm font-bold text-[var(--t1)]">Performance</span>
        <svg
          className={cn("w-4 h-4 text-[var(--t4)] transition-transform", isExpanded && "rotate-180")}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-[var(--s1)]">
                  <div className="text-xs text-[var(--t4)]">LCP</div>
                  <div className="text-sm font-bold text-[var(--t1)]">{formatTime(metrics.lcp?.startTime ?? null)}</div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--s1)]">
                  <div className="text-xs text-[var(--t4)]">FCP</div>
                  <div className="text-sm font-bold text-[var(--t1)]">{formatTime(metrics.fcp?.startTime ?? null)}</div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--s1)]">
                  <div className="text-xs text-[var(--t4)]">TTFB</div>
                  <div className="text-sm font-bold text-[var(--t1)]">{formatTime(metrics.ttfb)}</div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--s1)]">
                  <div className="text-xs text-[var(--t4)]">DCL</div>
                  <div className="text-sm font-bold text-[var(--t1)]">{formatTime(metrics.dcl)}</div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--s1)]">
                  <div className="text-xs text-[var(--t4)]">Load</div>
                  <div className="text-sm font-bold text-[var(--t1)]">{formatTime(metrics.load)}</div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--s1)]">
                  <div className="text-xs text-[var(--t4)]">FID</div>
                  <div className="text-sm font-bold text-[var(--t1)]">{formatTime(metrics.firstInput)}</div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[var(--s1)]">
                <div className="text-xs text-[var(--t4)] mb-1">Memory Usage</div>
                <div className="text-sm font-bold text-[var(--t1)]">
                  {formatBytes(metrics.memory?.usedJSHeapSize ?? null)} / {formatBytes(metrics.memory?.totalJSHeapSize ?? null)}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[var(--s1)]">
                <div className="text-xs text-[var(--t4)] mb-1">Long Tasks</div>
                <div className="text-sm font-bold text-[var(--t1)]">{metrics.longTasks.length}</div>
              </div>

              <div className="p-3 rounded-lg bg-[var(--s1)]">
                <div className="text-xs text-[var(--t4)] mb-1">Layout Shifts</div>
                <div className="text-sm font-bold text-[var(--t1)]">{metrics.shifts.length}</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Performance Optimizer ──
interface PerformanceOptimizerProps {
  children: React.ReactNode;
  className?: string;
}

export function PerformanceOptimizer({ children, className }: PerformanceOptimizerProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className={className}
      style={{
        ...(prefersReducedMotion && {
          "--animation-duration": "0s",
          "--transition-duration": "0s",
        }),
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

// ── Code Split Boundary ──
interface CodeSplitBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
}

export function CodeSplitBoundary({ children, fallback = null, errorFallback = null }: CodeSplitBoundaryProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = () => setHasError(true);
    window.addEventListener("error", handleError);
    return () => window.removeEventListener("error", handleError);
  }, []);

  if (hasError) return <>{errorFallback}</>;
  return <>{children ?? fallback}</>;
}

// ── Preconnect ──
export function Preconnect({ href }: { href: string }) {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, [href]);
  return null;
}

// ── Prefetch ──
export function Prefetch({ href }: { href: string }) {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = href;
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, [href]);
  return null;
}

// ── DNS Prefetch ──
export function DnsPrefetch({ href }: { href: string }) {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "dns-prefetch";
    link.href = href;
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, [href]);
  return null;
}

// ── Module Preload ──
export function ModulePreload({ href }: { href: string }) {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "modulepreload";
    link.href = href;
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, [href]);
  return null;
}

// ── View Transition ──
export function useViewTransition(callback: () => void) {
  const startTransition = useCallback(() => {
    if ((document as any).startViewTransition) {
      (document as any).startViewTransition(callback);
    } else {
      callback();
    }
  }, [callback]);

  return startTransition;
}

// ── Page Lifecycle ──
export function usePageLifecycle() {
  const [state, setState] = useState<"active" | "passive" | "hidden" | "frozen" | "terminated">("active");

  useEffect(() => {
    const handleVisibilityChange = () => {
      setState(document.hidden ? "hidden" : "active");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return state;
}

// ── Page Freeze ──
export function usePageFreeze() {
  const [isFrozen, setIsFrozen] = useState(false);

  useEffect(() => {
    const handleFreeze = () => setIsFrozen(true);
    const handleResume = () => setIsFrozen(false);

    document.addEventListener("freeze", handleFreeze);
    document.addEventListener("resume", handleResume);

    return () => {
      document.removeEventListener("freeze", handleFreeze);
      document.removeEventListener("resume", handleResume);
    };
  }, []);

  return isFrozen;
}

// ── BFCache ──
export function useBFCache() {
  const [isRestored, setIsRestored] = useState(false);

  useEffect(() => {
    const handlePageshow = (e: PageTransitionEvent) => {
      if (e.persisted) setIsRestored(true);
    };

    window.addEventListener("pageshow", handlePageshow);
    return () => window.removeEventListener("pageshow", handlePageshow);
  }, []);

  return isRestored;
}

// ── Scroll Lock ──
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (locked) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [locked]);
}

// ── Title ──
export function useTitle(title: string) {
  useEffect(() => { document.title = title; }, [title]);
}

// ── Meta ──
export function useMeta(name: string, content: string) {
  useEffect(() => {
    let element = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!element) {
      element = document.createElement("meta");
      element.name = name;
      document.head.appendChild(element);
    }
    element.content = content;
    return () => { if (element?.parentNode) element.parentNode.removeChild(element); };
  }, [name, content]);
}

// ── Canonical ──
export function useCanonical(url: string) {
  useEffect(() => {
    let element = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!element) {
      element = document.createElement("link");
      element.rel = "canonical";
      document.head.appendChild(element);
    }
    element.href = url;
    return () => { if (element?.parentNode) element.parentNode.removeChild(element); };
  }, [url]);
}

// ── JSON-LD ──
export function useJsonLd(data: Record<string, any>) {
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify(data);
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, [data]);
}
