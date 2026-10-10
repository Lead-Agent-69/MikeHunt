"use client";

import { PhotoPreview } from "@/components/shared/PhotoPreview";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ── Error Boundary ──
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--rlo)] flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-[var(--red)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[var(--t1)] mb-2">
              Something went wrong
            </h3>
            <p className="text-sm text-[var(--t4)] mb-4">
              Please refresh the page or try again later.
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 rounded-xl bg-[var(--grad)] text-white text-sm font-bold"
            >
              Try Again
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

// ── Loading State ──
interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({
  message = "Loading...",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center p-8", className)}
    >
      <div className="relative w-12 h-12 mb-4">
        <div className="absolute inset-0 rounded-full border-2 border-[var(--s3)]" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--amber)] animate-spin" />
      </div>
      <p className="text-sm text-[var(--t4)]">{message}</p>
    </div>
  );
}

// ── Empty State ──
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="w-20 h-20 rounded-full bg-[var(--s2)] flex items-center justify-center mb-4 text-[var(--t4)]">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-bold text-[var(--t1)] mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--t4)] max-w-sm mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}

// ── Skeleton Loader ──
interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className,
  variant = "text",
  width,
  height,
}: SkeletonProps) {
  const variants = {
    text: "h-4 rounded",
    circular: "rounded-full",
    rectangular: "rounded-xl",
  };

  return (
    <div
      className={cn(
        "bg-[var(--s2)] animate-pulse",
        variants[variant],
        className,
      )}
      style={{ width, height }}
    />
  );
}

// ── Skeleton Card ──
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[var(--r4)] overflow-hidden bg-[var(--s0)] border border-[var(--b1)]",
        className,
      )}
    >
      <div className="aspect-[4/3] bg-[var(--s2)] animate-pulse" />
      <div className="p-4 space-y-3">
        <div
          className="h-4 bg-[var(--s2)] rounded animate-pulse"
          style={{ width: "60%" }}
        />
        <div
          className="h-3 bg-[var(--s2)] rounded animate-pulse"
          style={{ width: "40%" }}
        />
        <div
          className="h-3 bg-[var(--s2)] rounded animate-pulse"
          style={{ width: "80%" }}
        />
      </div>
    </div>
  );
}

// ── Skeleton Grid ──
export function SkeletonGrid({
  count = 6,
  columns = 3,
  className,
}: {
  count?: number;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={cn("grid gap-4", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ── Skeleton Carousel ──
export function SkeletonCarousel({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="aspect-[16/9] rounded-[var(--r4)] bg-[var(--s2)] animate-pulse" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="w-20 h-14 rounded-lg bg-[var(--s2)] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

// ── Lazy Image ──
interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}

export function LazyImage({
  src,
  alt,
  className,
  priority = false,
}: LazyImageProps) {
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
      { rootMargin: "200px" },
    );

    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} className={cn("relative overflow-hidden", className)}>
      {!isLoaded && (
        <div className="absolute inset-0 bg-[var(--s2)] animate-pulse flex items-center justify-center">
          <svg
            className="w-8 h-8 text-[var(--s4)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </div>
      )}
      {isInView && (
        <img
          src={src}
          alt={alt}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-500",
            isLoaded ? "opacity-100" : "opacity-0",
          )}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setIsLoaded(true)}
        />
      )}
    </div>
  );
}

// ── Optimized Button ──
interface OptimizedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

export function OptimizedButton({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  disabled,
  ...props
}: OptimizedButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--amber)] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary:
      "bg-[var(--grad-amber)] text-[#0A0A0F] hover:opacity-90 active:scale-[0.98]",
    secondary:
      "bg-[var(--s2)] text-[var(--t2)] hover:bg-[var(--s3)] active:scale-[0.98]",
    ghost:
      "bg-transparent text-[var(--t2)] border border-[var(--b1)] hover:bg-[var(--s2)] active:scale-[0.98]",
    danger: "bg-[var(--red)] text-white hover:opacity-90 active:scale-[0.98]",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : icon ? (
        <span className="mr-2">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

// ── Optimized Card ──
interface OptimizedCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function OptimizedCard({
  children,
  className,
  hover = true,
  onClick,
}: OptimizedCardProps) {
  return (
    <motion.div
      className={cn(
        "relative rounded-[var(--r4)] overflow-hidden bg-[var(--s0)] border border-[var(--b1)]",
        hover && "transition-shadow duration-300 hover:shadow-lg",
        onClick && "cursor-pointer",
        className,
      )}
      onClick={onClick}
      whileHover={hover ? { y: -4 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      {children}
    </motion.div>
  );
}

// ── Optimized Modal ──
interface OptimizedModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export function OptimizedModal({
  isOpen,
  onClose,
  children,
  title,
  className,
}: OptimizedModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <motion.div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center p-4",
        className,
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        className={cn(
          "relative w-full max-w-lg bg-[var(--s0)] rounded-[var(--r4)] shadow-2xl",
          className,
        )}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-[var(--b1)]">
            <h3 className="text-lg font-bold text-[var(--t1)]">{title}</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[var(--s2)] flex items-center justify-center text-[var(--t4)] hover:bg-[var(--s3)]"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="p-4">{children}</div>
      </motion.div>
    </motion.div>
  );
}

// ── Optimized Tabs ──
interface OptimizedTabsProps {
  tabs: Array<{ id: string; label: string; icon?: React.ReactNode }>;
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function OptimizedTabs({
  tabs,
  activeTab,
  onChange,
  className,
}: OptimizedTabsProps) {
  return (
    <div className={cn("flex gap-1 p-1 bg-[var(--s2)] rounded-xl", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
            activeTab === tab.id
              ? "bg-[var(--s0)] text-[var(--t1)] shadow-sm"
              : "text-[var(--t4)] hover:text-[var(--t2)]",
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Optimized Search ──
interface OptimizedSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  onSearch?: (value: string) => void;
  className?: string;
}

export function OptimizedSearch({
  value,
  onChange,
  placeholder = "Search...",
  debounceMs = 300,
  onSearch,
  className,
}: OptimizedSearchProps) {
  const [localValue, setLocalValue] = useState(value);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const handleChange = useCallback(
    (newValue: string) => {
      setLocalValue(newValue);
      onChange(newValue);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onSearch?.(newValue);
      }, debounceMs);
    },
    [onChange, debounceMs, onSearch],
  );

  return (
    <div className={cn("relative", className)}>
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--t4)]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--b1)] bg-[var(--s0)] text-[var(--t1)] placeholder:text-[var(--t5)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)] focus:border-transparent transition-all"
      />
      {localValue && (
        <button
          onClick={() => handleChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--s3)] flex items-center justify-center text-[var(--t4)] hover:bg-[var(--s4)]"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Optimized Badge ──
interface OptimizedBadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info";
  className?: string;
}

export function OptimizedBadge({
  children,
  variant = "default",
  className,
}: OptimizedBadgeProps) {
  const variants = {
    default: "bg-[var(--s2)] text-[var(--t2)]",
    success: "bg-[var(--glo)] text-[var(--green)]",
    warning: "bg-[var(--olo)] text-[var(--orange)]",
    error: "bg-[var(--rlo)] text-[var(--red)]",
    info: "bg-[var(--blo)] text-[var(--blue)]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Optimized Progress ──
interface OptimizedProgressProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
}

export function OptimizedProgress({
  value,
  max = 100,
  className,
  showLabel = false,
}: OptimizedProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-xs font-medium text-[var(--t4)]">Progress</span>
          <span className="text-xs font-medium text-[var(--t4)]">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
      <div className="h-2 bg-[var(--s2)] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-[var(--grad)] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ── Optimized Tooltip ──
interface OptimizedTooltipProps {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
}

export function OptimizedTooltip({
  content,
  children,
  position = "top",
}: OptimizedTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <motion.div
          className={cn(
            "absolute z-50 px-3 py-1.5 text-xs font-medium text-white bg-[var(--t1)] rounded-lg whitespace-nowrap",
            positions[position],
          )}
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

// ── Optimized Image Gallery ──
interface OptimizedImageGalleryProps {
  images: Array<{ src: string; alt: string }>;
  columns?: 2 | 3 | 4;
  gap?: number;
  onImageClick?: (index: number) => void;
}

export function OptimizedImageGallery({
  images,
  columns = 3,
  gap = 16,
  onImageClick,
}: OptimizedImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleImageClick = (index: number) => {
    setSelectedIndex(index);
    onImageClick?.(index);
  };

  return (
    <>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: `${gap}px`,
        }}
      >
        {images.map((image, index) => (
          <motion.div
            key={index}
            className="relative aspect-square rounded-xl overflow-hidden cursor-pointer"
            onClick={() => handleImageClick(index)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <LazyImage
              src={image.src}
              alt={image.alt}
              className="w-full h-full"
            />
          </motion.div>
        ))}
      </div>

      <PhotoPreview
        images={images}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
      />
    </>
  );
}

// ── usePrefersReducedMotion Hook ──
export function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return prefersReducedMotion;
}

// ── useInfiniteScroll Hook ──
export function useInfiniteScroll(
  callback: () => void,
  hasMore: boolean,
  rootMargin = "200px",
) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) callback();
      },
      { rootMargin },
    );

    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [callback, hasMore, rootMargin]);

  return sentinelRef;
}

// ── useDebounce Hook ──
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// ── useMediaQuery Hook ──
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

// ── useNetworkStatus Hook ──
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

// ── useBatteryStatus Hook ──
export function useBatteryStatus() {
  const [battery, setBattery] = useState<{
    level: number;
    charging: boolean;
  } | null>(null);

  useEffect(() => {
    const getBattery = async () => {
      try {
        const battery = await (navigator as any).getBattery();
        setBattery({ level: battery.level, charging: battery.charging });

        const handleLevelChange = () =>
          setBattery((prev) =>
            prev ? { ...prev, level: battery.level } : null,
          );
        const handleChargingChange = () =>
          setBattery((prev) =>
            prev ? { ...prev, charging: battery.charging } : null,
          );

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

// ── useGeolocation Hook ──
export function useGeolocation() {
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setError(null);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  return { location, error, requestLocation };
}

// ── useClipboard Hook ──
export function useClipboard() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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

// ── useFullscreen Hook ──
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

// ── useWakeLock Hook ──
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

// ── usePerformanceMonitor Hook ──
interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  droppedFrames: number;
}

export function usePerformanceMonitor() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    frameTime: 0,
    droppedFrames: 0,
  });

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

// ── useMemoryUsage Hook ──
export function useMemoryUsage() {
  const [memory, setMemory] = useState<{
    usedJSHeapSize: number;
    totalJSHeapSize: number;
  } | null>(null);

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

// ── useTitle Hook ──
export function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

// ── useMeta Hook ──
export function useMeta(name: string, content: string) {
  useEffect(() => {
    let element = document.querySelector<HTMLMetaElement>(
      `meta[name="${name}"]`,
    );
    if (!element) {
      element = document.createElement("meta");
      element.name = name;
      document.head.appendChild(element);
    }
    element.content = content;
    return () => {
      if (element?.parentNode) element.parentNode.removeChild(element);
    };
  }, [name, content]);
}

// ── useCanonical Hook ──
export function useCanonical(url: string) {
  useEffect(() => {
    let element = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (!element) {
      element = document.createElement("link");
      element.rel = "canonical";
      document.head.appendChild(element);
    }
    element.href = url;
    return () => {
      if (element?.parentNode) element.parentNode.removeChild(element);
    };
  }, [url]);
}

// ── useJsonLd Hook ──
export function useJsonLd(data: Record<string, any>) {
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify(data);
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [data]);
}

// ── Preconnect Component ──
export function Preconnect({ href }: { href: string }) {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, [href]);
  return null;
}

// ── Prefetch Component ──
export function Prefetch({ href }: { href: string }) {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = href;
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, [href]);
  return null;
}

// ── DnsPrefetch Component ──
export function DnsPrefetch({ href }: { href: string }) {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "dns-prefetch";
    link.href = href;
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, [href]);
  return null;
}

// ── ModulePreload Component ──
export function ModulePreload({ href }: { href: string }) {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "modulepreload";
    link.href = href;
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, [href]);
  return null;
}

// ── ViewTransition Hook ──
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

// ── PageLifecycle Hook ──
export function usePageLifecycle() {
  const [state, setState] = useState<
    "active" | "passive" | "hidden" | "frozen" | "terminated"
  >("active");

  useEffect(() => {
    const handleVisibilityChange = () => {
      setState(document.hidden ? "hidden" : "active");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return state;
}

// ── PageFreeze Hook ──
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

// ── BFCache Hook ──
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

// ── ScrollLock Hook ──
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (locked) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [locked]);
}

// ── Production Ready Provider ──
interface ProductionReadyProviderProps {
  children: React.ReactNode;
}

export function ProductionReadyProvider({
  children,
}: ProductionReadyProviderProps) {
  const { isOnline } = useNetworkStatus();
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <ErrorBoundary>
      <div
        className={cn(
          prefersReducedMotion &&
            "motion-reduce:transition-none motion-reduce:animate-none",
        )}
        data-online={isOnline}
      >
        {children}
      </div>
    </ErrorBoundary>
  );
}
