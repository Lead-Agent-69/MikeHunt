"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { PhotoPreview } from "@/components/shared/PhotoPreview";

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
        <div className="absolute inset-0 bg-[var(--s2)] animate-pulse" />
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
          onLoad={() => setIsLoaded(true)}
        />
      )}
    </div>
  );
}

// ── Optimized Button ──
interface OptimizedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function OptimizedButton({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className,
  disabled,
  ...props
}: OptimizedButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--amber)] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-[var(--grad)] text-white hover:opacity-90 active:scale-[0.98]",
    secondary:
      "bg-[var(--s2)] text-[var(--t2)] hover:bg-[var(--s3)] active:scale-[0.98]",
    ghost:
      "bg-transparent text-[var(--t2)] hover:bg-[var(--s2)] active:scale-[0.98]",
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
      {loading && (
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
      )}
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
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
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
      timeoutRef.current = setTimeout(() => onSearch?.(newValue), debounceMs);
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

// ── Optimized Skeleton ──
interface OptimizedSkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
}

export function OptimizedSkeleton({
  className,
  variant = "text",
  width,
  height,
}: OptimizedSkeletonProps) {
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

// ── Optimized Skeleton Card ──
export function OptimizedSkeletonCard({ className }: { className?: string }) {
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

// ── Optimized Skeleton Grid ──
export function OptimizedSkeletonGrid({
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
        <OptimizedSkeletonCard key={i} />
      ))}
    </div>
  );
}

// ── Optimized Skeleton Carousel ──
export function OptimizedSkeletonCarousel({
  className,
}: {
  className?: string;
}) {
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

// ── Optimized Empty State ──
interface OptimizedEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function OptimizedEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: OptimizedEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className,
      )}
    >
      {icon && (
        <div className="w-16 h-16 rounded-full bg-[var(--s2)] flex items-center justify-center mb-4 text-[var(--t4)]">
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

// ── Optimized Error State ──
interface OptimizedErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function OptimizedErrorState({
  title = "Something went wrong",
  message = "Please try again.",
  onRetry,
  className,
}: OptimizedErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className,
      )}
    >
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
      <h3 className="text-lg font-bold text-[var(--t1)] mb-2">{title}</h3>
      <p className="text-sm text-[var(--t4)] max-w-sm mb-4">{message}</p>
      {onRetry && (
        <OptimizedButton onClick={onRetry} variant="primary">
          Try Again
        </OptimizedButton>
      )}
    </div>
  );
}

// ── Optimized Spinner ──
interface OptimizedSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function OptimizedSpinner({
  size = "md",
  className,
}: OptimizedSpinnerProps) {
  const sizes = { sm: "w-4 h-4", md: "w-8 h-8", lg: "w-12 h-12" };
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <svg
        className={cn("animate-spin text-[var(--amber)]", sizes[size])}
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
