import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular" | "card";
  animation?: "pulse" | "wave" | "none";
}

export function Skeleton({
  className,
  variant = "rectangular",
  animation = "pulse",
}: SkeletonProps) {
  const baseClasses =
    "bg-gradient-to-r from-[var(--s2)] via-[var(--s3)] to-[var(--s2)] bg-[length:200%_100%]";

  const variantClasses = {
    text: "h-4 rounded",
    circular: "rounded-full aspect-square",
    rectangular: "rounded-[var(--r2)]",
    card: "rounded-[var(--r3)] min-h-[200px]",
  };

  const animationClasses = {
    pulse: "animate-pulse",
    wave: "animate-[wave_1.5s_ease-in-out_infinite]",
    none: "",
  };

  return (
    <div
      className={cn(
        baseClasses,
        variantClasses[variant],
        animationClasses[animation],
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    />
  );
}

// Specialized skeleton components
export function SkeletonText({
  lines = 1,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={i === lines - 1 ? "w-3/4" : "w-full"}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("glass-panel p-4 md:p-6 space-y-4", className)}>
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" className="w-12 h-12" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" className="w-1/2" />
          <Skeleton variant="text" className="w-1/3" />
        </div>
      </div>
      <SkeletonText lines={3} />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}

export function SkeletonDealCard({ className }: { className?: string }) {
  return (
    <div className={cn("glass-panel overflow-hidden", className)}>
      <Skeleton className="w-full aspect-[4/3]" animation="wave" />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton variant="text" className="w-24 h-5" />
          <Skeleton variant="text" className="w-16 h-5" />
        </div>
        <Skeleton variant="text" className="w-full h-6" />
        <div className="flex gap-2">
          <Skeleton variant="text" className="w-20 h-4" />
          <Skeleton variant="text" className="w-20 h-4" />
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-[var(--b1)]">
          <Skeleton variant="text" className="w-24 h-8" />
          <Skeleton variant="text" className="w-20 h-6" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="glass-panel overflow-hidden">
      {/* Header */}
      <div
        className="grid gap-4 p-4 border-b border-[var(--b1)]"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} variant="text" className="h-5" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="grid gap-4 p-4 border-b border-[var(--b1)] last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }).map((_, colIdx) => (
            <Skeleton key={colIdx} variant="text" className="h-4" />
          ))}
        </div>
      ))}
    </div>
  );
}
