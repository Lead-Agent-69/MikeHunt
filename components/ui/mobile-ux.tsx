"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

// ── Network Status ──
interface NetworkStatus {
  isOnline: boolean;
  isOffline: boolean;
}

const NetworkContext = createContext<NetworkStatus>({
  isOnline: true,
  isOffline: false,
});

export const useNetwork = () => useContext(NetworkContext);

export const NetworkProvider = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    isOffline: !navigator.onLine,
  });

  useEffect(() => {
    const handleOnline = () => setStatus({ isOnline: true, isOffline: false });
    const handleOffline = () => setStatus({ isOnline: false, isOffline: true });

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <NetworkContext.Provider value={status}>{children}</NetworkContext.Provider>
  );
};

// ── Network Status Banner ──
export function NetworkStatusBanner() {
  const { isOffline } = useNetwork();
  const [show, setShow] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (isOffline) {
      setWasOffline(true);
      setShow(true);
    } else if (wasOffline) {
      setShow(true);
      const timer = setTimeout(() => setShow(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOffline, wasOffline]);

  if (!show) return null;

  return (
    <div
      className={cn("connection-status-mobile", isOffline ? "offline" : "online")}
      role="alert"
      aria-live="polite"
    >
      {isOffline ? "You're offline. Some features may be limited." : "Back online!"}
    </div>
  );
}

// ── Offline Banner ──
export function OfflineBanner() {
  const { isOffline } = useNetwork();
  const [dismissed, setDismissed] = useState(false);

  if (!isOffline || dismissed) return null;

  return (
    <div className="offline-banner" role="alert">
      <div className="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 1l22 22" />
          <path d="M16.72 11.06A10.94 10.94 0 0119 12.55" />
          <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0122.58 9" />
          <path d="M1.42 9a15.91 15.91 0 014.7-2.88" />
          <path d="M8.53 16.11a6 6 0 016.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>
      <div className="text">
        <div className="title">You're offline</div>
        <div className="subtitle">Check your connection to continue</div>
      </div>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="h-8 w-8 grid place-items-center rounded-lg text-[var(--t4)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Pull to Refresh ──
interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  threshold?: number;
  disabled?: boolean;
}

export function PullToRefresh({ onRefresh, children, threshold = 80, disabled = false }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing) return;
    if (window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
    setIsPulling(true);
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling || disabled || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    if (diff > 0 && window.scrollY === 0) {
      setPullDistance(Math.min(diff * 0.5, threshold * 1.5));
    }
  }, [isPulling, disabled, isRefreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || disabled || isRefreshing) return;
    setIsPulling(false);
    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isPulling, pullDistance, threshold, onRefresh, disabled, isRefreshing]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("touchend", handleTouchEnd);
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <div ref={containerRef} className="pull-to-refresh">
      {(isPulling || isRefreshing) && (
        <div className={cn("pull-indicator", isPulling && "visible")} style={{ transform: `translateX(-50%) translateY(${pullDistance}px)` }}>
          {isRefreshing ? (
            <svg className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: pullDistance >= threshold ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}>
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Swipeable Card ──
interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftAction?: { label: string; color: string; icon?: React.ReactNode };
  rightAction?: { label: string; color: string; icon?: React.ReactNode };
  threshold?: number;
  disabled?: boolean;
}

export function SwipeableCard({ children, onSwipeLeft, onSwipeRight, leftAction, rightAction, threshold = 100, disabled = false }: SwipeableCardProps) {
  const [offset, setOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    setIsSwiping(true);
  }, [disabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isSwiping || disabled) return;
    const currentX = e.touches[0].clientX;
    setOffset(currentX - startX.current);
  }, [isSwiping, disabled]);

  const handleTouchEnd = useCallback(() => {
    if (!isSwiping || disabled) return;
    setIsSwiping(false);
    if (offset > threshold && onSwipeRight) onSwipeRight();
    else if (offset < -threshold && onSwipeLeft) onSwipeLeft();
    setOffset(0);
  }, [isSwiping, offset, threshold, onSwipeLeft, onSwipeRight, disabled]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("touchend", handleTouchEnd);
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <div ref={containerRef} className="swipe-card">
      {(leftAction || rightAction) && (
        <>
          {leftAction && (
            <div className="swipe-actions left" style={{ background: leftAction.color, opacity: Math.max(0, offset / threshold) }}>
              {leftAction.icon}{leftAction.label}
            </div>
          )}
          {rightAction && (
            <div className="swipe-actions right" style={{ background: rightAction.color, opacity: Math.max(0, -offset / threshold) }}>
              {rightAction.icon}{rightAction.label}
            </div>
          )}
        </>
      )}
      <div className="swipe-content" style={{ transform: `translateX(${offset}px)`, transition: isSwiping ? "none" : "transform 0.3s var(--ease-out)" }}>
        {children}
      </div>
    </div>
  );
}

// ── Mobile Bottom Sheet ──
interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

export function BottomSheet({ isOpen, onClose, children, title }: BottomSheetProps) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} style={{ animation: "fadeIn 0.2s ease" }} />
      <div className="bottom-sheet open" role="dialog" aria-modal="true">
        <div className="bottom-sheet-handle" />
        {title && <h3 className="text-lg font-bold text-[var(--t1)] mb-4">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

// ── Mobile Action Sheet ──
interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  actions: Array<{ label: string; icon?: React.ReactNode; destructive?: boolean; onClick: () => void }>;
}

export function ActionSheet({ isOpen, onClose, title, actions }: ActionSheetProps) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="action-sheet open" role="dialog" aria-modal="true">
        <div className="handle" />
        {title && <h3>{title}</h3>}
        {actions.map((action, i) => (
          <button key={i} className={cn("item", action.destructive && "destructive")} onClick={() => { action.onClick(); onClose(); }}>
            {action.icon}{action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Mobile Skeleton Loader ──
export function MobileSkeleton({ type = "card", count = 3 }: { type?: "card" | "list" | "detail"; count?: number }) {
  if (type === "list") {
    return (
      <div className="skeleton-mobile">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 mb-4">
            <div className="skeleton-circle" />
            <div className="flex-1">
              <div className="skeleton-text" style={{ width: "60%" }} />
              <div className="skeleton-text" style={{ width: "40%" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (type === "detail") {
    return (
      <div className="skeleton-mobile">
        <div className="skeleton-block" style={{ height: 200, marginBottom: 16 }} />
        <div className="skeleton-title" />
        <div className="skeleton-text" style={{ width: "80%" }} />
        <div className="skeleton-text" style={{ width: "60%" }} />
        <div className="skeleton-text" style={{ width: "70%" }} />
        <div className="skeleton-block" style={{ height: 100, marginTop: 16 }} />
      </div>
    );
  }
  return (
    <div className="skeleton-mobile">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-block" style={{ marginBottom: 12 }} />
      ))}
    </div>
  );
}

// ── Mobile Empty State ──
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

export function MobileEmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="empty-state-mobile">
      <div className="icon">
        {icon || (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        )}
      </div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action && (
        <button className="btn btn-primary px-6 py-3 rounded-xl" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

// ── Mobile Error State ──
interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function MobileErrorState({ title = "Something went wrong", message = "We couldn't load this content. Please try again.", onRetry }: ErrorStateProps) {
  return (
    <div className="error-state-mobile">
      <div className="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
      {onRetry && <button className="retry-btn" onClick={onRetry}>Try Again</button>}
    </div>
  );
}

// ── Mobile Success State ──
interface SuccessStateProps {
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

export function MobileSuccessState({ title, message, action }: SuccessStateProps) {
  return (
    <div className="success-screen-mobile">
      <div className="success-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <h2>{title}</h2>
      {message && <p>{message}</p>}
      {action && (
        <button className="action-btn" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

// ── Mobile Toast ──
interface ToastProps {
  message: string;
  type?: "success" | "error" | "info" | "warning";
  duration?: number;
  onClose?: () => void;
}

export function MobileToast({ message, type = "info", duration = 3000, onClose }: ToastProps) {
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
    <div className="toast-mobile" role="alert" style={{ borderLeft: `4px solid ${colors[type]}` }}>
      <div style={{ color: colors[type], width: 20, height: 20 }}>{icons[type]}</div>
      <span className="flex-1 text-sm font-medium text-[var(--t1)]">{message}</span>
    </div>
  );
}

// ── Mobile Search Bar ──
interface MobileSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
  autoFocus?: boolean;
}

export function MobileSearchBar({ value, onChange, placeholder = "Search...", onClear, autoFocus }: MobileSearchBarProps) {
  return (
    <div className="mobile-search">
      <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} enterKeyHint="search" />
      {value && (
        <button className="voice-input-btn" onClick={onClear} aria-label="Clear search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Mobile Filter Chips ──
interface FilterChipsProps {
  options: Array<{ label: string; value: string; active?: boolean }>;
  onChange: (value: string) => void;
  multiSelect?: boolean;
}

export function MobileFilterChips({ options, onChange, multiSelect = false }: FilterChipsProps) {
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
    <div className="mobile-filter-chips" role="tablist">
      {options.map((option) => (
        <button key={option.value} role="tab" aria-selected={selected.includes(option.value)} className={cn("chip", selected.includes(option.value) && "active")} onClick={() => handleClick(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ── Mobile Segmented Control ──
interface SegmentedControlProps {
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}

export function MobileSegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div className="segmented-control-mobile" role="tablist">
      {options.map((option) => (
        <button key={option.value} role="tab" aria-selected={value === option.value} className={cn("segment", value === option.value && "active")} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ── Mobile Tabs ──
interface MobileTabsProps {
  tabs: Array<{ label: string; value: string; icon?: React.ReactNode }>;
  value: string;
  onChange: (value: string) => void;
}

export function MobileTabs({ tabs, value, onChange }: MobileTabsProps) {
  return (
    <div className="tabs-mobile" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.value} role="tab" aria-selected={value === tab.value} className={cn("tab", value === tab.value && "active")} onClick={() => onChange(tab.value)}>
          {tab.icon}{tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Mobile Infinite Scroll ──
interface InfiniteScrollProps {
  children: React.ReactNode;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  threshold?: number;
}

export function MobileInfiniteScroll({ children, hasMore, isLoading, onLoadMore, threshold = 200 }: InfiniteScrollProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && hasMore && !isLoading) onLoadMore(); },
      { rootMargin: `${threshold}px` }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoadMore, threshold]);

  return (
    <>
      {children}
      <div ref={sentinelRef} className="infinite-scroll-sentinel" />
      {isLoading && (
        <div className="infinite-scroll-loading">
          <div className="spinner" />
          <span>Loading more...</span>
        </div>
      )}
      {!hasMore && !isLoading && (
        <div className="end-of-list-mobile">
          <div className="icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <p>You've reached the end</p>
        </div>
      )}
    </>
  );
}

// ── Mobile Sticky Bottom Bar ──
interface StickyBottomBarProps { children: React.ReactNode; }
export function MobileStickyBottomBar({ children }: StickyBottomBarProps) {
  return <div className="sticky-bottom-mobile">{children}</div>;
}

// ── Mobile Page Header ──
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export function MobilePageHeader({ title, subtitle, onBack, rightAction }: PageHeaderProps) {
  return (
    <div className="page-header-mobile">
      <div className="header-content">
        {onBack && (
          <button className="back-btn" onClick={onBack} aria-label="Go back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="header-text">
          <div className="header-title">{title}</div>
          {subtitle && <div className="header-subtitle">{subtitle}</div>}
        </div>
        {rightAction}
      </div>
    </div>
  );
}

// ── Mobile FAB ──
interface FABProps { icon: React.ReactNode; onClick: () => void; label?: string; }
export function MobileFAB({ icon, onClick, label }: FABProps) {
  return <button className="fab" onClick={onClick} aria-label={label}>{icon}</button>;
}

// ── Mobile Speed Dial ──
interface SpeedDialProps {
  mainIcon: React.ReactNode;
  actions: Array<{ icon: React.ReactNode; label: string; onClick: () => void }>;
}

export function MobileSpeedDial({ mainIcon, actions }: SpeedDialProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="speed-dial-mobile">
      <div className={cn("dial-items", open && "open")}>
        {actions.map((action, i) => (
          <div key={i} className="dial-item">
            <span className="label">{action.label}</span>
            <button className="icon-btn" onClick={() => { action.onClick(); setOpen(false); }}>{action.icon}</button>
          </div>
        ))}
      </div>
      <button className={cn("main-btn", open && "open")} onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"}>{mainIcon}</button>
    </div>
  );
}

// ── Mobile Toggle ──
interface ToggleProps { checked: boolean; onChange: (checked: boolean) => void; label?: string; }
export function MobileToggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className={cn("toggle-mobile", checked && "active")} onClick={() => onChange(!checked)}>
      <div className="thumb" />
    </button>
  );
}

// ── Mobile Rating ──
interface RatingProps { value: number; onChange?: (value: number) => void; max?: number; size?: number; }
export function MobileRating({ value, onChange, max = 5, size = 20 }: RatingProps) {
  return (
    <div className="rating-mobile" role="radiogroup">
      {Array.from({ length: max }).map((_, i) => (
        <svg key={i} className={cn("star", i < value && "filled")} width={size} height={size} viewBox="0 0 24 24" fill={i < value ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" onClick={() => onChange?.(i + 1)} role="radio" aria-checked={i < value} aria-label={`${i + 1} star${i > 0 ? "s" : ""}`}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

// ── Mobile Progress Bar ──
interface ProgressBarProps { value: number; max?: number; label?: string; }
export function MobileProgressBar({ value, max = 100, label }: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div>
      {label && (
        <div className="flex justify-between mb-1">
          <span className="text-xs font-semibold text-[var(--t3)]">{label}</span>
          <span className="text-xs font-semibold text-[var(--t4)]">{Math.round(percentage)}%</span>
        </div>
      )}
      <div className="progress-mobile">
        <div className="bar" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

// ── Mobile Accordion ──
interface AccordionProps { title: string; children: React.ReactNode; defaultOpen?: boolean; }
export function MobileAccordion({ title, children, defaultOpen = false }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="accordion-mobile">
      <button className={cn("accordion-header", open && "open")} onClick={() => setOpen(!open)} aria-expanded={open}>
        <h4>{title}</h4>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div className={cn("accordion-content", open && "open")}>
        <div className="inner">{children}</div>
      </div>
    </div>
  );
}

// ── Mobile Stepper ──
interface StepperProps { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; }
export function MobileStepper({ value, onChange, min = 0, max = 100, step = 1 }: StepperProps) {
  return (
    <div className="stepper-mobile">
      <button className="step-btn" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label="Decrease">−</button>
      <span className="step-value">{value}</span>
      <button className="step-btn" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} aria-label="Increase">+</button>
    </div>
  );
}

// ── Mobile Badge ──
interface BadgeProps { children: React.ReactNode; variant?: "primary" | "success" | "warning" | "error"; }
export function MobileBadge({ children, variant = "primary" }: BadgeProps) {
  return <span className={cn("badge-mobile", variant)}>{children}</span>;
}

// ── Mobile Card List ──
interface CardListProps { children: React.ReactNode; }
export function MobileCardList({ children }: CardListProps) {
  return <div className="card-list-mobile">{children}</div>;
}

// ── Mobile Stat Card ──
interface StatCardProps { label: string; value: string | number; change?: number; changeLabel?: string; }
export function MobileStatCard({ label, value, change, changeLabel }: StatCardProps) {
  return (
    <div className="stat-card-mobile">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {change !== undefined && (
        <div className={cn("stat-change", change >= 0 ? "positive" : "negative")}>
          {change >= 0 ? "↑" : "↓"} {Math.abs(change)}%{changeLabel && ` ${changeLabel}`}
        </div>
      )}
    </div>
  );
}

// ── Mobile View Toggle ──
interface ViewToggleProps { views: Array<{ icon: React.ReactNode; value: string; label: string }>; value: string; onChange: (value: string) => void; }
export function MobileViewToggle({ views, value, onChange }: ViewToggleProps) {
  return (
    <div className="view-toggle-mobile" role="tablist">
      {views.map((view) => (
        <button key={view.value} role="tab" aria-selected={value === view.value} aria-label={view.label} className={cn("toggle-btn", value === view.value && "active")} onClick={() => onChange(view.value)}>{view.icon}</button>
      ))}
    </div>
  );
}

// ── Mobile Breadcrumb ──
interface BreadcrumbProps { items: Array<{ label: string; onClick?: () => void }>; }
export function MobileBreadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="breadcrumb-mobile" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="separator">/</span>}
          <span className={cn("crumb", i === items.length - 1 && "active")} onClick={item.onClick}>{item.label}</span>
        </React.Fragment>
      ))}
    </nav>
  );
}

// ── Mobile Pagination ──
interface PaginationProps { currentPage: number; totalPages: number; onPageChange: (page: number) => void; }
export function MobilePagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  const end = Math.min(totalPages, start + maxVisible - 1);
  start = Math.max(1, end - maxVisible + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="pagination-mobile">
      <button className="page-btn" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      {start > 1 && (<><button className="page-btn" onClick={() => onPageChange(1)}>1</button>{start > 2 && <span className="page-btn">...</span>}</>)}
      {pages.map((page) => (
        <button key={page} className={cn("page-btn", page === currentPage && "active")} onClick={() => onPageChange(page)}>{page}</button>
      ))}
      {end < totalPages && (<>{end < totalPages - 1 && <span className="page-btn">...</span>}<button className="page-btn" onClick={() => onPageChange(totalPages)}>{totalPages}</button></>)}
      <button className="page-btn" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Next page">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
      </button>
    </div>
  );
}

// ── Mobile Data Table ──
interface Column { key: string; label: string; sortable?: boolean; }
interface DataTableProps { columns: Column[]; data: Record<string, any>[]; onRowClick?: (row: Record<string, any>) => void; }
export function MobileDataTable({ columns, data, onRowClick }: DataTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sortedData = React.useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey]; const bVal = b[sortKey];
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  return (
    <div className="overflow-x-auto">
      <table className="data-table-mobile">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={cn(col.sortable && "sortable")} onClick={() => col.sortable && handleSort(col.key)}>
                {col.label}{col.sortable && sortKey === col.key && <span>{sortDir === "asc" ? " ↑" : " ↓"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, i) => (
            <tr key={i} onClick={() => onRowClick?.(row)}>
              {columns.map((col) => <td key={col.key}>{row[col.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Mobile List View ──
interface ListItem { id: string; title: string; subtitle?: string; icon?: React.ReactNode; onClick?: () => void; rightElement?: React.ReactNode; }
interface ListViewProps { items: ListItem[]; }
export function MobileListView({ items }: ListViewProps) {
  return (
    <div className="list-view-mobile">
      {items.map((item) => (
        <div key={item.id} className="list-item" onClick={item.onClick} role={item.onClick ? "button" : undefined}>
          {item.icon && <div className="item-icon">{item.icon}</div>}
          <div className="item-content">
            <div className="item-title">{item.title}</div>
            {item.subtitle && <div className="item-subtitle">{item.subtitle}</div>}
          </div>
          {item.rightElement && <div className="item-action">{item.rightElement}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Mobile Grid View ──
interface GridItem { id: string; title: string; subtitle?: string; image?: string; onClick?: () => void; }
interface GridViewProps { items: GridItem[]; columns?: number; }
export function MobileGridView({ items, columns = 2 }: GridViewProps) {
  return (
    <div className="grid-view-mobile" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {items.map((item) => (
        <div key={item.id} className="grid-item" onClick={item.onClick} role={item.onClick ? "button" : undefined}>
          {item.image && (
            <div className="item-image">
              <img src={item.image} alt={item.title} loading="lazy" />
            </div>
          )}
          <div className="item-content">
            <div className="item-title">{item.title}</div>
            {item.subtitle && <div className="item-subtitle">{item.subtitle}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Mobile Carousel ──
interface CarouselProps { children: React.ReactNode; itemWidth?: number; }
export function MobileCarousel({ children, itemWidth = 280 }: CarouselProps) {
  return (
    <div className="carousel-mobile">
      {React.Children.map(children, (child, i) => (
        <div key={i} className="carousel-item" style={{ width: itemWidth }}>{child}</div>
      ))}
    </div>
  );
}

// ── Mobile Hero ──
interface HeroProps { title: string; subtitle?: string; ctaLabel?: string; onCtaClick?: () => void; }
export function MobileHero({ title, subtitle, ctaLabel, onCtaClick }: HeroProps) {
  return (
    <div className="hero-mobile">
      <div className="hero-content">
        <h1 className="hero-title">{title}</h1>
        {subtitle && <p className="hero-subtitle">{subtitle}</p>}
        {ctaLabel && <button className="hero-cta" onClick={onCtaClick}>{ctaLabel}</button>}
      </div>
    </div>
  );
}

// ── Mobile Section ──
interface SectionProps { title: string; actionLabel?: string; onActionClick?: () => void; children: React.ReactNode; }
export function MobileSection({ title, actionLabel, onActionClick, children }: SectionProps) {
  return (
    <div className="section-mobile">
      <div className="section-header">
        <h2 className="section-title">{title}</h2>
        {actionLabel && <span className="section-action" onClick={onActionClick}>{actionLabel}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Mobile Confirmation Dialog ──
interface ConfirmDialogProps {
  isOpen: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean;
}
export function MobileConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", destructive = false }: ConfirmDialogProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="confirm-dialog-mobile open" role="alertdialog" aria-modal="true">
        <div className="handle" />
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        <div className="actions">
          <button className="cancel" onClick={onClose}>{cancelLabel}</button>
          <button className={destructive ? "destructive" : "confirm"} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Mobile Date Picker ──
interface DatePickerProps { isOpen: boolean; onClose: () => void; onSelect: (date: Date) => void; selectedDate?: Date; }
export function MobileDatePicker({ isOpen, onClose, onSelect, selectedDate }: DatePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate || new Date());
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="date-picker-mobile open" role="dialog" aria-modal="true">
        <div className="handle" />
        <div className="header">
          <h3>{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h3>
          <div>
            <button className="cancel" onClick={onClose}>Cancel</button>
            <button className="confirm" onClick={() => { onSelect(selectedDate || new Date()); onClose(); }}>Done</button>
          </div>
        </div>
        <div className="calendar">
          {dayNames.map((d) => <div key={d} className="day-label">{d}</div>)}
          {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} className="day disabled" />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isSelected = selectedDate && selectedDate.getDate() === day && selectedDate.getMonth() === currentMonth.getMonth() && selectedDate.getFullYear() === currentMonth.getFullYear();
            return (
              <div key={day} className={cn("day", isSelected && "selected")} onClick={() => onSelect(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day))}>{day}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Mobile Time Picker ──
interface TimePickerProps { isOpen: boolean; onClose: () => void; onSelect: (hours: number, minutes: number) => void; initialHours?: number; initialMinutes?: number; }
export function MobileTimePicker({ isOpen, onClose, onSelect, initialHours = 12, initialMinutes = 0 }: TimePickerProps) {
  const [hours, setHours] = useState(initialHours);
  const [minutes, setMinutes] = useState(initialMinutes);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="time-picker-mobile open" role="dialog" aria-modal="true">
        <div className="handle" />
        <div className="header">
          <h3>Select Time</h3>
          <div>
            <button className="cancel" onClick={onClose}>Cancel</button>
            <button className="confirm" onClick={() => { onSelect(hours, minutes); onClose(); }}>Done</button>
          </div>
        </div>
        <div className="time-display">
          <div className="time-section">
            <div className="value">{hours.toString().padStart(2, "0")}</div>
            <div className="label">Hours</div>
          </div>
          <div className="separator">:</div>
          <div className="time-section">
            <div className="value">{minutes.toString().padStart(2, "0")}</div>
            <div className="label">Minutes</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mobile Color Picker ──
interface ColorPickerProps { isOpen: boolean; onClose: () => void; onSelect: (color: string) => void; colors: string[]; selectedColor?: string; }
export function MobileColorPicker({ isOpen, onClose, onSelect, colors, selectedColor }: ColorPickerProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="color-picker-mobile open" role="dialog" aria-modal="true">
        <div className="handle" />
        <div className="colors">
          {colors.map((color) => (
            <div key={color} className={cn("color-option", selectedColor === color && "selected")} style={{ background: color }} onClick={() => { onSelect(color); onClose(); }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Mobile Slider ──
interface SliderProps { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; label?: string; }
export function MobileSlider({ value, onChange, min = 0, max = 100, step = 1, label }: SliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;
  return (
    <div>
      {label && (
        <div className="flex justify-between mb-2">
          <span className="text-sm font-semibold text-[var(--t3)]">{label}</span>
          <span className="text-sm font-bold text-[var(--t1)]">{value}</span>
        </div>
      )}
      <div className="slider-mobile">
        <div className="track">
          <div className="fill" style={{ width: `${percentage}%` }} />
          <div className="thumb" style={{ left: `${percentage}%` }} role="slider" aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} tabIndex={0} onKeyDown={(e) => { if (e.key === "ArrowLeft") onChange(Math.max(min, value - step)); if (e.key === "ArrowRight") onChange(Math.min(max, value + step)); }} />
        </div>
      </div>
    </div>
  );
}

// ── Mobile Chip Input ──
interface ChipInputProps { chips: string[]; onChange: (chips: string[]) => void; placeholder?: string; }
export function MobileChipInput({ chips, onChange, placeholder = "Add..." }: ChipInputProps) {
  const [input, setInput] = useState("");
  const addChip = () => { if (input.trim() && !chips.includes(input.trim())) { onChange([...chips, input.trim()]); setInput(""); } };
  const removeChip = (chip: string) => { onChange(chips.filter((c) => c !== chip)); };
  return (
    <div className="chip-input-mobile">
      {chips.map((chip) => (
        <span key={chip} className="chip">
          {chip}
          <button className="remove" onClick={() => removeChip(chip)} aria-label={`Remove ${chip}`}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </span>
      ))}
      <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChip(); } }} placeholder={placeholder} />
    </div>
  );
}

// ── Mobile Context Menu ──
interface ContextMenuProps { isOpen: boolean; onClose: () => void; title?: string; items: Array<{ label: string; icon?: React.ReactNode; destructive?: boolean; onClick: () => void }>; }
export function MobileContextMenu({ isOpen, onClose, title, items }: ContextMenuProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="context-menu-mobile open" role="menu" aria-modal="true">
        <div className="handle" />
        {title && <h3 className="text-center text-sm font-bold text-[var(--t2)] mb-2">{title}</h3>}
        {items.map((item, i) => (
          <button key={i} className={cn("menu-item", item.destructive && "destructive")} onClick={() => { item.onClick(); onClose(); }} role="menuitem">
            {item.icon}{item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Mobile Share Sheet ──
interface ShareSheetProps { isOpen: boolean; onClose: () => void; title?: string; url?: string; text?: string; }
export function MobileShareSheet({ isOpen, onClose, title = "Share", url, text }: ShareSheetProps) {
  if (!isOpen) return null;
  const shareOptions = [
    { label: "Copy Link", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>, action: () => { if (url) navigator.clipboard.writeText(url); } },
    { label: "Messages", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>, action: () => { if (url) window.open(`sms:?&body=${encodeURIComponent(text || url)}`); } },
    { label: "Email", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><path d="M22 6l-10 7L2 6" /></svg>, action: () => { if (url) window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text || url)}`); } },
    { label: "More", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>, action: () => { if (navigator.share) navigator.share({ title, text, url }); } },
  ];
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="share-sheet-mobile open" role="dialog" aria-modal="true">
        <div className="handle" />
        <h3>{title}</h3>
        <div className="share-options">
          {shareOptions.map((option, i) => (
            <button key={i} className="share-option" onClick={() => { option.action(); onClose(); }}>
              <div className="icon">{option.icon}</div>
              <span className="label">{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Mobile Onboarding ──
interface OnboardingProps { isOpen: boolean; onClose: () => void; steps: Array<{ title: string; description: string; image?: string }>; }
export function MobileOnboarding({ isOpen, onClose, steps }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  if (!isOpen) return null;
  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  return (
    <div className="onboarding-mobile" role="dialog" aria-modal="true">
      <button className="skip-btn" onClick={onClose}>Skip</button>
      <div className="slide">
        {step.image && <img src={step.image} alt="" />}
        <h2>{step.title}</h2>
        <p>{step.description}</p>
      </div>
      <div className="dots">
        {steps.map((_, i) => <div key={i} className={cn("dot", i === currentStep && "active")} />)}
      </div>
      <button className="next-btn" onClick={() => { if (isLast) onClose(); else setCurrentStep(currentStep + 1); }}>
        {isLast ? "Get Started" : "Next"}
      </button>
    </div>
  );
}

// ── Mobile Tooltip ──
interface TooltipProps { text: string; visible: boolean; }
export function MobileTooltip({ text, visible }: TooltipProps) {
  if (!visible) return null;
  return <div className="tooltip-mobile" role="tooltip">{text}</div>;
}

// ── Mobile Progress Steps ──
interface ProgressStepsProps { steps: string[]; currentStep: number; }
export function MobileProgressSteps({ steps, currentStep }: ProgressStepsProps) {
  return (
    <div className="progress-steps-mobile">
      {steps.map((step, i) => (
        <React.Fragment key={i}>
          <div className={cn("step", i === currentStep && "active", i < currentStep && "completed")}>
            <div className="dot">
              {i < currentStep ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
              ) : (i + 1)}
            </div>
            <span className="label">{step}</span>
          </div>
          {i < steps.length - 1 && <div className={cn("step-connector", i < currentStep && "completed")} />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Mobile Wizard ──
interface WizardProps { steps: Array<{ title: string; content: React.ReactNode }>; onComplete: () => void; onCancel: () => void; }
export function MobileWizard({ steps, onComplete, onCancel }: WizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const progress = ((currentStep + 1) / steps.length) * 100;
  return (
    <div className="wizard-mobile">
      <div className="wizard-header">
        <div className="progress-bar">
          <div className="fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="step-info">
          <span className="step-count">Step {currentStep + 1} of {steps.length}</span>
          <span className="step-title">{step.title}</span>
        </div>
      </div>
      <div className="wizard-content">{step.content}</div>
      <div className="wizard-footer">
        <button className="back-btn" onClick={() => { if (currentStep === 0) onCancel(); else setCurrentStep(currentStep - 1); }}>
          {currentStep === 0 ? "Cancel" : "Back"}
        </button>
        <button className="next-btn" onClick={() => { if (isLast) onComplete(); else setCurrentStep(currentStep + 1); }}>
          {isLast ? "Complete" : "Next"}
        </button>
      </div>
    </div>
  );
}

// ── Mobile Form Wizard ──
interface FormWizardProps {
  steps: Array<{
    title: string;
    description?: string;
    fields: Array<{
      name: string;
      label: string;
      type: "text" | "email" | "tel" | "number" | "select" | "textarea";
      placeholder?: string;
      required?: boolean;
      options?: Array<{ label: string; value: string }>;
      hint?: string;
    }>;
  }>;
  onComplete: (data: Record<string, any>) => void;
  onCancel: () => void;
}

export function MobileFormWizard({ steps, onComplete, onCancel }: FormWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  const handleChange = (name: string, value: string) => {
    setFormData({ ...formData, [name]: value });
    if (errors[name]) setErrors({ ...errors, [name]: "" });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    step.fields.forEach((field) => {
      if (field.required && !formData[field.name]) newErrors[field.name] = `${field.label} is required`;
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      if (isLast) onComplete(formData);
      else setCurrentStep(currentStep + 1);
    }
  };

  return (
    <div className="wizard-mobile">
      <div className="wizard-header">
        <div className="progress-bar">
          <div className="fill" style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="step-info">
          <span className="step-count">Step {currentStep + 1} of {steps.length}</span>
          <span className="step-title">{step.title}</span>
        </div>
      </div>
      <div className="wizard-content">
        <div className="multi-step-form-mobile">
          <div className="step-section">
            <div className="section-header">
              <div className="section-number">{currentStep + 1}</div>
              <div className="section-title">{step.title}</div>
            </div>
            {step.description && <div className="section-description">{step.description}</div>}
            <div className="form-wizard-mobile">
              {step.fields.map((field) => (
                <div key={field.name} className="form-group">
                  <label htmlFor={field.name}>{field.label}</label>
                  {field.type === "select" ? (
                    <select id={field.name} value={formData[field.name] || ""} onChange={(e) => handleChange(field.name, e.target.value)}>
                      <option value="">Select...</option>
                      {field.options?.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea id={field.name} value={formData[field.name] || ""} onChange={(e) => handleChange(field.name, e.target.value)} placeholder={field.placeholder} />
                  ) : (
                    <input type={field.type} id={field.name} value={formData[field.name] || ""} onChange={(e) => handleChange(field.name, e.target.value)} placeholder={field.placeholder} inputMode={field.type === "number" ? "numeric" : field.type === "tel" ? "tel" : field.type === "email" ? "email" : undefined} />
                  )}
                  {errors[field.name] && <span className="error">{errors[field.name]}</span>}
                  {field.hint && <span className="hint">{field.hint}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="wizard-footer">
        <button className="back-btn" onClick={() => { if (currentStep === 0) onCancel(); else setCurrentStep(currentStep - 1); }}>
          {currentStep === 0 ? "Cancel" : "Back"}
        </button>
        <button className="next-btn" onClick={handleNext}>
          {isLast ? "Complete" : "Next"}
        </button>
      </div>
    </div>
  );
}

// ── Mobile Review Section ──
interface ReviewSectionProps { title: string; items: Array<{ label: string; value: string }>; onEdit?: () => void; }
export function MobileReviewSection({ title, items, onEdit }: ReviewSectionProps) {
  return (
    <div className="review-section-mobile">
      <div className="review-header">
        <h4>{title}</h4>
        {onEdit && <button className="edit-btn" onClick={onEdit}>Edit</button>}
      </div>
      <div className="review-content">
        {items.map((item, i) => (
          <div key={i} className="review-item">
            <span className="label">{item.label}</span>
            <span className="value">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mobile Celebration ──
interface CelebrationProps { visible: boolean; title: string; message?: string; }
export function MobileCelebration({ visible, title, message }: CelebrationProps) {
  if (!visible) return null;
  const colors = ["#ff7a4d", "#f25b9a", "#9b6bff", "#5b9bef", "#00ff66"];
  return (
    <div className="celebration-mobile">
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="confetti" style={{ left: `${Math.random() * 100}%`, background: colors[i % colors.length], animationDelay: `${Math.random() * 2}s`, animationDuration: `${2 + Math.random() * 2}s` }} />
      ))}
      <div className="celebration-content">
        <h2>{title}</h2>
        {message && <p>{message}</p>}
      </div>
    </div>
  );
}

// ── Mobile Splash Screen ──
interface SplashScreenProps { visible: boolean; appName?: string; tagline?: string; }
export function MobileSplashScreen({ visible, appName = "MikeHunt", tagline = "Underpriced cars, deal-scored" }: SplashScreenProps) {
  if (!visible) return null;
  return (
    <div className="splash-screen-mobile">
      <div className="logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 13l2-2 4 4 6-6 4 4 2-2" />
        </svg>
      </div>
      <div className="app-name">{appName}</div>
      <div className="tagline">{tagline}</div>
      <div className="loader" />
    </div>
  );
}

// ── Mobile App Banner ──
interface AppBannerProps { visible: boolean; onOpen: () => void; onClose: () => void; }
export function MobileAppBanner({ visible, onOpen, onClose }: AppBannerProps) {
  if (!visible) return null;
  return (
    <div className="app-banner-mobile show">
      <div className="app-icon" />
      <div className="app-info">
        <div className="app-name">MikeHunt</div>
        <div className="app-rating">4.8 ★</div>
      </div>
      <button className="open-btn" onClick={onOpen}>Open</button>
      <button className="close-btn" onClick={onClose} aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

// ── Mobile Update Banner ──
interface UpdateBannerProps { visible: boolean; onUpdate: () => void; }
export function MobileUpdateBanner({ visible, onUpdate }: UpdateBannerProps) {
  if (!visible) return null;
  return (
    <div className="update-banner-mobile show">
      <span className="update-text">A new version is available</span>
      <button className="update-btn" onClick={onUpdate}>Update</button>
    </div>
  );
}

// ── Mobile Maintenance ──
interface MaintenanceProps { visible: boolean; message?: string; }
export function MobileMaintenance({ visible, message = "We'll be back soon. Check back in a few minutes." }: MaintenanceProps) {
  if (!visible) return null;
  return (
    <div className="maintenance-mobile">
      <div className="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
      </div>
      <h2>Under Maintenance</h2>
      <p>{message}</p>
    </div>
  );
}

// ── Mobile Rate Limit ──
interface RateLimitProps { visible: boolean; retryAfter: number; onRetry: () => void; }
export function MobileRateLimit({ visible, retryAfter, onRetry }: RateLimitProps) {
  const [countdown, setCountdown] = useState(retryAfter);
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [visible]);
  if (!visible) return null;
  return (
    <div className="rate-limit-mobile">
      <div className="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>
      <h2>Too Many Requests</h2>
      <p>You've hit the rate limit. Please wait before trying again.</p>
      <div className="countdown">{countdown}s</div>
      <button className="retry-btn" onClick={onRetry} disabled={countdown > 0}>
        {countdown > 0 ? `Retry in ${countdown}s` : "Retry Now"}
      </button>
    </div>
  );
}

// ── Mobile Server Error ──
interface ServerErrorProps { visible: boolean; errorCode?: string; onRetry: () => void; }
export function MobileServerError({ visible, errorCode, onRetry }: ServerErrorProps) {
  if (!visible) return null;
  return (
    <div className="server-error-mobile">
      <div className="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <h2>Something Went Wrong</h2>
      <p>We're experiencing technical difficulties. Please try again later.</p>
      {errorCode && <div className="error-code">Error: {errorCode}</div>}
      <button className="retry-btn" onClick={onRetry}>Try Again</button>
    </div>
  );
}

// ── Mobile No Results ──
interface NoResultsProps { title?: string; message?: string; onClearFilters?: () => void; }
export function MobileNoResults({ title = "No results found", message = "Try adjusting your filters or search terms.", onClearFilters }: NoResultsProps) {
  return (
    <div className="no-results-mobile">
      <div className="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
      {onClearFilters && <button className="clear-filters-btn" onClick={onClearFilters}>Clear Filters</button>}
    </div>
  );
}

// ── Mobile Loading More ──
export function MobileLoadingMore() {
  return (
    <div className="loading-more-mobile">
      <div className="spinner" />
      <span>Loading more...</span>
    </div>
  );
}

// ── Mobile End of List ──
export function MobileEndOfList() {
  return (
    <div className="end-of-list-mobile">
      <div className="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <p>You've reached the end</p>
    </div>
  );
}

// ── Mobile Pull Text ──
export function MobilePullText({ text = "Pull to refresh" }: { text?: string }) {
  return <div className="pull-text-mobile">{text}</div>;
}

// ── Mobile Refresh Indicator ──
export function MobileRefreshIndicator() {
  return (
    <div className="refresh-indicator-mobile">
      <div className="spinner" />
      <span>Refreshing...</span>
    </div>
  );
}

// ── Mobile Swipe Hint ──
export function MobileSwipeHint({ text = "Swipe to see more" }: { text?: string }) {
  return (
    <div className="swipe-hint-mobile">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
      {text}
    </div>
  );
}

// ── Mobile Gesture Hint ──
export function MobileGestureHint({ text }: { text: string }) {
  return <div className="gesture-hint-mobile">{text}</div>;
}

// ── Mobile Tutorial Overlay ──
interface TutorialOverlayProps { visible: boolean; title: string; description: string; onDismiss: () => void; }
export function MobileTutorialOverlay({ visible, title, description, onDismiss }: TutorialOverlayProps) {
  if (!visible) return null;
  return (
    <div className="tutorial-overlay-mobile">
      <div className="tutorial-card">
        <h3>{title}</h3>
        <p>{description}</p>
        <button className="got-it-btn" onClick={onDismiss}>Got it</button>
      </div>
    </div>
  );
}

// ── Mobile Feature Discovery ──
interface FeatureDiscoveryProps { visible: boolean; title: string; description: string; position: { top: number; left: number; width: number; height: number }; onNext: () => void; }
export function MobileFeatureDiscovery({ visible, title, description, position, onNext }: FeatureDiscoveryProps) {
  if (!visible) return null;
  return (
    <div className="feature-discovery-mobile">
      <div className="spotlight" style={{ top: position.top, left: position.left, width: position.width, height: position.height }} />
      <div className="tooltip" style={{ top: position.top + position.height + 16, left: Math.max(16, position.left) }}>
        <h4>{title}</h4>
        <p>{description}</p>
        <button className="next-btn" onClick={onNext}>Next</button>
      </div>
    </div>
  );
}

// ── Mobile Coach Mark ──
interface CoachMarkProps { visible: boolean; text: string; position: { top: number; left: number; width: number; height: number }; onDismiss: () => void; }
export function MobileCoachMark({ visible, text, position, onDismiss }: CoachMarkProps) {
  if (!visible) return null;
  return (
    <div className="coach-mark-mobile">
      <div className="highlight" style={{ top: position.top, left: position.left, width: position.width, height: position.height }} />
      <div className="callout" style={{ top: position.top + position.height + 16, left: Math.max(16, position.left) }}>
        <p>{text}</p>
        <button className="dismiss-btn" onClick={onDismiss}>Got it</button>
      </div>
    </div>
  );
}

// ── Mobile Barcode Scanner ──
interface BarcodeScannerProps { visible: boolean; onClose: () => void; onScan: (code: string) => void; }
export function MobileBarcodeScanner({ visible, onClose, onScan }: BarcodeScannerProps) {
  if (!visible) return null;
  return (
    <div className="barcode-scanner-mobile">
      <div className="scanner-frame" />
      <div className="instructions">Position the barcode within the frame</div>
      <button className="close-btn" onClick={onClose} aria-label="Close scanner">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

// ── Mobile Image Viewer ──
interface ImageViewerProps { visible: boolean; images: string[]; initialIndex?: number; onClose: () => void; }
export function MobileImageViewer({ visible, images, initialIndex = 0, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  if (!visible) return null;
  return (
    <div className="image-viewer-mobile">
      <img src={images[currentIndex]} alt="" />
      <button className="close-btn" onClick={onClose} aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
      <div className="image-info">{currentIndex + 1} / {images.length}</div>
    </div>
  );
}

// ── Mobile Voice Input ──
interface VoiceInputProps { onResult: (text: string) => void; onClose: () => void; }
export function MobileVoiceInput({ onResult, onClose }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center">
      <div className="w-24 h-24 rounded-full flex items-center justify-center mb-8" style={{ background: listening ? "var(--grad)" : "var(--s2)", animation: listening ? "pulse 1.5s ease infinite" : "none" }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={listening ? "white" : "var(--t4)"} strokeWidth="2">
          <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
          <path d="M19 10v2a7 7 0 01-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </div>
      <p className="text-white text-lg font-semibold mb-2">{listening ? "Listening..." : "Tap to speak"}</p>
      <p className="text-white/60 text-sm mb-8">{listening ? "Speak now" : "Voice input"}</p>
      <div className="flex gap-4">
        <button className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "var(--s2)" }} onClick={() => setListening(!listening)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--t1)" strokeWidth="2">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
        <button className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "var(--red)" }} onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}

// ── Mobile Quick Actions ──
interface QuickActionsProps { actions: Array<{ icon: React.ReactNode; label: string; onClick: () => void }>; }
export function MobileQuickActions({ actions }: QuickActionsProps) {
  return (
    <div className="quick-actions-mobile">
      {actions.map((action, i) => (
        <button key={i} className="quick-btn" onClick={action.onClick} aria-label={action.label}>{action.icon}</button>
      ))}
    </div>
  );
}

// ── Mobile Bulk Actions ──
interface BulkActionsProps { selectedCount: number; actions: Array<{ label: string; variant?: "primary" | "secondary" | "destructive"; onClick: () => void }>; onClear: () => void; }
export function MobileBulkActions({ selectedCount, actions, onClear }: BulkActionsProps) {
  return (
    <div className="bulk-actions-mobile">
      <span className="selected-count">{selectedCount} selected</span>
      {actions.map((action, i) => (
        <button key={i} className={`action-btn ${action.variant || "primary"}`} onClick={action.onClick}>{action.label}</button>
      ))}
      <button className="action-btn secondary" onClick={onClear}>Clear</button>
    </div>
  );
}

// ── Mobile Context Bar ──
interface ContextBarProps { title: string; subtitle?: string; actions: Array<{ icon: React.ReactNode; label: string; onClick: () => void; variant?: "save" | "share" | "more" }>; }
export function MobileContextBar({ title, subtitle, actions }: ContextBarProps) {
  return (
    <div className="context-bar-mobile">
      <div className="context-info">
        <div className="context-title">{title}</div>
        {subtitle && <div className="context-subtitle">{subtitle}</div>}
      </div>
      <div className="context-actions">
        {actions.map((action, i) => (
          <button key={i} className={`${action.variant || "more"}-btn`} onClick={action.onClick} aria-label={action.label}>{action.icon}</button>
        ))}
      </div>
    </div>
  );
}

// ── Mobile Deep Link Banner ──
interface DeepLinkBannerProps { visible: boolean; title: string; subtitle?: string; onOpen: () => void; }
export function MobileDeepLinkBanner({ visible, title, subtitle, onOpen }: DeepLinkBannerProps) {
  if (!visible) return null;
  return (
    <div className="deep-link-banner-mobile">
      <div className="banner-icon" />
      <div className="banner-content">
        <div className="banner-title">{title}</div>
        {subtitle && <div className="banner-subtitle">{subtitle}</div>}
      </div>
      <button className="banner-action" onClick={onOpen}>Open</button>
    </div>
  );
}

// ── Mobile Filter Bar ──
interface FilterBarProps {
  filters: Array<{ label: string; value: string; active?: boolean; icon?: React.ReactNode }>;
  onFilterChange: (value: string) => void;
  resultCount?: number;
  sortLabel?: string;
  onSortClick?: () => void;
}
export function MobileFilterBar({ filters, onFilterChange, resultCount, sortLabel, onSortClick }: FilterBarProps) {
  return (
    <>
      <div className="filter-bar-mobile">
        {filters.map((filter) => (
          <button key={filter.value} className={cn("filter-btn", filter.active && "active")} onClick={() => onFilterChange(filter.value)}>
            {filter.icon}{filter.label}
          </button>
        ))}
      </div>
      {(resultCount !== undefined || sortLabel) && (
        <div className="sort-bar-mobile">
          {resultCount !== undefined && <span className="results-count">{resultCount} results</span>}
          {sortLabel && (
            <button className="sort-btn" onClick={onSortClick}>
              {sortLabel}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 15l5 5 5-5M7 9l5-5 5 5" /></svg>
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ── Mobile Search Header ──
interface SearchHeaderProps { value: string; onChange: (value: string) => void; placeholder?: string; onClear?: () => void; autoFocus?: boolean; }
export function MobileSearchHeader({ value, onChange, placeholder = "Search...", onClear, autoFocus }: SearchHeaderProps) {
  return (
    <div className="search-header-mobile">
      <div className="search-bar">
        <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} enterKeyHint="search" />
        {value && (
          <button className="clear-btn" onClick={onClear} aria-label="Clear search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Mobile Sticky Top Bar ──
interface StickyTopBarProps { title: string; onBack?: () => void; rightAction?: React.ReactNode; }
export function MobileStickyTopBar({ title, onBack, rightAction }: StickyTopBarProps) {
  return (
    <div className="sticky-top-mobile">
      {onBack && (
        <button className="back-btn" onClick={onBack} aria-label="Go back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
      )}
      <span className="title">{title}</span>
      {rightAction}
    </div>
  );
}

// ── Mobile Content Area ──
interface ContentAreaProps { children: React.ReactNode; }
export function MobileContentArea({ children }: ContentAreaProps) {
  return <div className="content-mobile">{children}</div>;
}

// ── Mobile Divider ──
export function MobileDivider() {
  return <div className="divider-mobile" />;
}

// ── Mobile Spacer ──
export function MobileSpacer() {
  return <div className="spacer-mobile" />;
}

// ── Mobile Section Header ──
interface SectionHeaderProps { title: string; actionLabel?: string; onActionClick?: () => void; }
export function MobileSectionHeader({ title, actionLabel, onActionClick }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <h2 className="section-title">{title}</h2>
      {actionLabel && <span className="section-action" onClick={onActionClick}>{actionLabel}</span>}
    </div>
  );
}

// ── Mobile Map ──
interface MapProps { children: React.ReactNode; onZoomIn?: () => void; onZoomOut?: () => void; onLocate?: () => void; }
export function MobileMap({ children, onZoomIn, onZoomOut, onLocate }: MapProps) {
  return (
    <div className="map-mobile">
      {children}
      <div className="map-controls">
        {onZoomIn && (
          <button onClick={onZoomIn} aria-label="Zoom in">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        )}
        {onZoomOut && (
          <button onClick={onZoomOut} aria-label="Zoom out">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14" /></svg>
          </button>
        )}
        {onLocate && (
          <button onClick={onLocate} aria-label="Locate me">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="8" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Mobile Chart ──
interface ChartProps { title: string; data: Array<{ label: string; value: number; color?: string }>; type?: "bar" | "line" | "pie"; }
export function MobileChart({ title, data, type = "bar" }: ChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value));
  return (
    <div className="chart-mobile">
      <div className="chart-header">
        <span className="chart-title">{title}</span>
      </div>
      {type === "bar" && (
        <div className="flex items-end gap-2 h-32">
          {data.map((item, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t" style={{ height: `${(item.value / maxValue) * 100}%`, background: item.color || "var(--grad)", minHeight: 4 }} />
              <span className="text-[10px] text-[var(--t4)] truncate w-full text-center">{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mobile Masonry ──
interface MasonryProps { children: React.ReactNode; }
export function MobileMasonry({ children }: MasonryProps) {
  return <div className="masonry-mobile">{children}</div>;
}

// ── Mobile Hero Section ──
interface HeroSectionProps { title: string; subtitle?: string; ctaLabel?: string; onCtaClick?: () => void; children?: React.ReactNode; }
export function MobileHeroSection({ title, subtitle, ctaLabel, onCtaClick, children }: HeroSectionProps) {
  return (
    <div className="hero-mobile">
      <div className="hero-content">
        <h1 className="hero-title">{title}</h1>
        {subtitle && <p className="hero-subtitle">{subtitle}</p>}
        {ctaLabel && <button className="hero-cta" onClick={onCtaClick}>{ctaLabel}</button>}
        {children}
      </div>
    </div>
  );
}

// ── Mobile Page Transition ──
interface PageTransitionProps { children: React.ReactNode; className?: string; }
export function MobilePageTransition({ children, className }: PageTransitionProps) {
  return <div className={cn("page-enter", className)}>{children}</div>;
}

// ── Mobile Accessibility Helpers ──
export function MobileSkipLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} className="skip-link">{children}</a>;
}

// ── Mobile ARIA Live Region ──
interface LiveRegionProps { message: string; priority?: "polite" | "assertive"; }
export function MobileLiveRegion({ message, priority = "polite" }: LiveRegionProps) {
  return (
    <div role="status" aria-live={priority} aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

// ── Mobile Focus Trap ──
interface FocusTrapProps { active: boolean; children: React.ReactNode; }
export function MobileFocusTrap({ active, children }: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === firstElement) { e.preventDefault(); lastElement?.focus(); }
      } else {
        if (document.activeElement === lastElement) { e.preventDefault(); firstElement?.focus(); }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    firstElement?.focus();
    return () => { document.removeEventListener("keydown", handleKeyDown); };
  }, [active]);
  return <div ref={containerRef}>{children}</div>;
}

// ── Mobile Reduced Motion ──
export function usePrefersReducedMotion() {
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

// ── Mobile Haptic Feedback ──
export function useHapticFeedback() {
  const vibrate = useCallback((pattern: number | number[]) => {
    if ("vibrate" in navigator) navigator.vibrate(pattern);
  }, []);
  return {
    light: () => vibrate(10),
    medium: () => vibrate(20),
    heavy: () => vibrate([30, 10, 30]),
    success: () => vibrate([10, 50, 10]),
    error: () => vibrate([50, 100, 50]),
    warning: () => vibrate([30, 50, 30]),
  };
}

// ── Mobile Keyboard Detection ──
export function useKeyboardDetection() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) setIsKeyboardVisible(true);
    };
    const handleFocusOut = () => setIsKeyboardVisible(false);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    return () => { document.removeEventListener("focusin", handleFocusIn); document.removeEventListener("focusout", handleFocusOut); };
  }, []);
  return isKeyboardVisible;
}

// ── Mobile Scroll Position ──
export function useScrollPosition() {
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  return scrollY;
}

// ── Mobile Debounce ──
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ── Mobile Local Storage ──
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try { const item = window.localStorage.getItem(key); return item ? JSON.parse(item) : initialValue; }
    catch { return initialValue; }
  });
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch { /* Silently fail */ }
  };
  return [storedValue, setValue];
}

// ── Mobile Media Query ──
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

// ── Mobile Orientation ──
export function useOrientation() {
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(window.innerHeight > window.innerWidth ? "portrait" : "landscape");
  useEffect(() => {
    const handleResize = () => setOrientation(window.innerHeight > window.innerWidth ? "portrait" : "landscape");
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return orientation;
}

// ── Mobile Online Status ──
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, []);
  return isOnline;
}

// ── Mobile Visibility Change ──
export function useVisibilityChange() {
  const [isVisible, setIsVisible] = useState(!document.hidden);
  useEffect(() => {
    const handleVisibilityChange = () => setIsVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);
  return isVisible;
}

// ── Mobile Intersection Observer ──
export function useIntersectionObserver(elementRef: React.RefObject<Element>, options?: IntersectionObserverInit) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setIsIntersecting(entry.isIntersecting), options);
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef, options]);
  return isIntersecting;
}

// ── Mobile Scroll Lock ──
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (locked) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [locked]);
}

// ── Mobile Title ──
export function useTitle(title: string) {
  useEffect(() => { document.title = title; }, [title]);
}
