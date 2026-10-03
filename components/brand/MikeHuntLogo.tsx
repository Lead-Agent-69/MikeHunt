"use client";

import { cn } from "@/lib/utils";

type LogoSize = "sm" | "md" | "lg";

const MARK_SIZES: Record<LogoSize, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
};

const WORDMARK_SIZES: Record<LogoSize, string> = {
  sm: "text-[17px]",
  md: "text-xl",
  lg: "text-2xl",
};

export function MikeHuntMark({
  size = "sm",
  className,
  tile = true,
}: {
  size?: LogoSize;
  className?: string;
  tile?: boolean;
}) {
  const ink = tile ? "#ffffff" : "#075BE8";

  return (
    <svg
      className={cn(MARK_SIZES[size], "shrink-0", className)}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="MikeHunt aviator mark"
    >
      {tile && <rect width="64" height="64" rx="15" fill="#075BE8" />}
      <path
        d="M12 28.7c1.2-9.5 8.6-16.2 19.8-16.2 11.7 0 19.5 6.8 20.6 16.4-6.4-3.2-12.6-4.7-20.1-4.7-7.9 0-14.2 1.5-20.3 4.5Z"
        fill={ink}
      />
      <path
        d="M10.4 31.8c5.5-4.5 12.9-6.8 21.8-6.8 8.7 0 16 2.2 21.5 6.7"
        stroke={tile ? "#075BE8" : "#ffffff"}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M10.6 32.9c5.7-4.6 13.1-6.9 21.8-6.9 8.5 0 15.7 2.2 21 6.7"
        stroke={ink}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M18.3 36.1c.9-1.2 2.3-1.8 4.2-1.8h9.1c1.4 0 2.4 1.2 2.1 2.6l-1.6 7.4c-.7 3.3-3.4 5.7-6.8 5.7h-2.6c-3.3 0-5.9-2.7-5.7-6l.3-4.7c.1-1.2.4-2.3 1-3.2Z"
        fill={ink}
      />
      <path
        d="M46 36.1c-.9-1.2-2.3-1.8-4.2-1.8h-9.1c-1.4 0-2.4 1.2-2.1 2.6l1.6 7.4c.7 3.3 3.4 5.7 6.8 5.7h2.6c3.3 0 5.9-2.7 5.7-6l-.3-4.7c-.1-1.2-.4-2.3-1-3.2Z"
        fill={ink}
      />
      <path
        d="M27.6 36.1c2.6-1.1 6.4-1.1 9 0"
        stroke={ink}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M24.4 52.1c4.7 4.1 11 4.1 15.6 0"
        stroke={ink}
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MikeHuntLogo({
  size = "sm",
  className,
  wordmarkClassName,
  showWordmark = true,
  tile = true,
}: {
  size?: LogoSize;
  className?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
  tile?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <MikeHuntMark size={size} tile={tile} />
      {showWordmark && (
        <span
          className={cn(
            "font-black uppercase leading-none tracking-tight text-[var(--t1)]",
            WORDMARK_SIZES[size],
            wordmarkClassName,
          )}
        >
          MIKEHUNT
        </span>
      )}
    </span>
  );
}
