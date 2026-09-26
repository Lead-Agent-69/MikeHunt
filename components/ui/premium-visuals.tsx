"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";

/**
 * Animated dot grid background — like Aceternity UI's "Background Dots".
 * Renders a subtle animated grid of dots that pulse and glow on dark mode.
 */
export function DotGridBackground({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden
    >
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="dot-grid"
            x="0"
            y="0"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx="1"
              cy="1"
              r="1"
              className="fill-[var(--b2)] dark:fill-[var(--b2)]"
            />
          </pattern>
          <radialGradient id="dot-fade" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="80%" stopColor="white" stopOpacity="0.2" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="dot-mask">
            <rect width="100%" height="100%" fill="url(#dot-fade)" />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="url(#dot-grid)"
          mask="url(#dot-mask)"
        />
      </svg>
    </div>
  );
}

/**
 * Meteor shower effect — streaking lines animated across a dark surface.
 * Inspired by Magic UI's "Meteor" component.
 */
// Positions must be identical on server and client — Math.random() at render time produced a
// hydration mismatch on every page that shows meteors. A per-index hash keeps the spread varied
// while staying deterministic.
function meteorRandom(seed: number, salt: number) {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function Meteors({ count = 20 }: { count?: number }) {
  const meteors = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.floor(meteorRandom(i, 1) * 80) + 10}%`,
    // Values are quantised because the browser rounds them when it serialises the style
    // attribute — a raw float like 153.8668778975989px comes back as 153.867px, and "0.70s"
    // comes back as "0.7s". Dividing an integer keeps the shortest form, which round-trips.
    delay: `${Math.round(meteorRandom(i, 2) * 400) / 100}s`,
    duration: `${Math.floor(meteorRandom(i, 3) * 5) + 3}s`,
    size: Math.round(meteorRandom(i, 4) * 100) / 100 + 0.5,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {meteors.map((m) => (
        <span
          key={m.id}
          className="absolute top-0 block h-[1px] rotate-[215deg] animate-[meteor_linear_infinite] rounded-full bg-gradient-to-r from-white to-transparent"
          style={{
            left: m.left,
            width: `${Math.round(m.size * 100) + 50}px`,
            animationDelay: m.delay,
            animationDuration: m.duration,
            opacity: 0.4,
            boxShadow: `0 0 ${Math.round(m.size * 4)}px ${Math.round(m.size * 10) / 10}px rgba(255,255,255,0.2)`,
          }}
        />
      ))}
      <style>{`
        @keyframes meteor {
          0% { transform: rotate(215deg) translateX(0); opacity: 1; }
          70% { opacity: 0.8; }
          100% { transform: rotate(215deg) translateX(-700px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/**
 * Glowing border beam — a neon light that rotates around a card's border.
 * Inspired by Magic UI's "Border Beam" component.
 */
export function BorderBeam({
  className = "",
  duration = 8,
  colorFrom = "var(--amber)",
  colorTo = "var(--purple)",
  size = 200,
}: {
  className?: string;
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  size?: number;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`}
      aria-hidden
    >
      <motion.div
        className="absolute"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(transparent 60%, ${colorFrom}, ${colorTo}, transparent 90%)`,
          filter: "blur(8px)",
          opacity: 0.6,
        }}
        animate={{
          rotate: 360,
          left: ["-50%", "150%", "150%", "-50%"],
          top: ["-50%", "-50%", "150%", "150%"],
        }}
        transition={{
          duration,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </div>
  );
}

/**
 * Spotlight / radial glow that follows your mouse cursor.
 * Inspired by Aceternity UI's "Spotlight" component.
 */
export function Spotlight({
  className = "",
  fill = "rgba(242,91,154,0.15)",
}: {
  className?: string;
  fill?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const circle = svg.querySelector("circle");
      if (circle) {
        circle.setAttribute("cx", String(x));
        circle.setAttribute("cy", String(y));
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <svg
      ref={ref}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden
    >
      <defs>
        <radialGradient id="spotlight-gradient" r="30%" fx="50%" fy="50%">
          <stop offset="0%" stopColor={fill} stopOpacity="1" />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        cx="50%"
        cy="50%"
        r="600"
        fill="url(#spotlight-gradient)"
      />
    </svg>
  );
}

/**
 * Shimmer / shine border on hover — a sweeping light effect across a card.
 * Inspired by Magic UI's "Shine Border" component.
 */
export function ShineBorder({
  children,
  className = "",
  color = ["var(--amber)", "var(--purple)", "#00ff66"],
}: {
  children: React.ReactNode;
  className?: string;
  color?: string | string[];
}) {
  const gradient = Array.isArray(color)
    ? `conic-gradient(from 0deg, ${color.join(", ")})`
    : color;

  return (
    <div className={`group relative ${className}`}>
      {/* The rotating conic gradient border */}
      <div
        className="absolute -inset-[1px] rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none overflow-hidden"
        aria-hidden
      >
        <motion.div
          className="absolute inset-[-100%]"
          style={{ background: gradient }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
      </div>
      <div className="relative rounded-[inherit] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

/**
 * Text scramble / reveal — text that scrambles then resolves to the target string.
 * Inspired by sci-fi terminal aesthetics.
 */
export function ScrambleText({
  text,
  className = "",
  trigger = true,
}: {
  text: string;
  className?: string;
  trigger?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$#@!";

  useEffect(() => {
    if (!trigger || !ref.current) return;
    const el = ref.current;
    let iteration = 0;
    const interval = setInterval(() => {
      el.innerText = text
        .split("")
        .map((letter, idx) => {
          if (idx < iteration) return letter;
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join("");

      if (iteration >= text.length) {
        clearInterval(interval);
        el.innerText = text;
      }
      iteration += 1 / 2;
    }, 30);

    return () => clearInterval(interval);
  }, [text, trigger]);

  return (
    <span ref={ref} className={`font-mono ${className}`}>
      {text}
    </span>
  );
}

/**
 * Animated gradient text — cycles through vibrant gradient colors.
 */
export function GradientText({
  children,
  className = "",
  from = "#ff7a4d",
  via = "#f25b9a",
  to = "#9b6bff",
}: {
  children: React.ReactNode;
  className?: string;
  from?: string;
  via?: string;
  to?: string;
}) {
  return (
    <motion.span
      className={`bg-clip-text text-transparent ${className}`}
      style={{
        backgroundImage: `linear-gradient(135deg, ${from}, ${via}, ${to}, ${from})`,
        backgroundSize: "300% 300%",
      }}
      animate={{
        backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
      }}
      transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
    >
      {children}
    </motion.span>
  );
}

/**
 * Animated counter that counts up from 0 to the target value on mount.
 * Styled like a live stock ticker.
 */
export function LiveCounter({
  value,
  prefix = "",
  suffix = "",
  className = "",
  duration = 2,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = performance.now();
    const update = (time: number) => {
      const elapsed = (time - start) / (duration * 1000);
      const progress = Math.min(elapsed, 1);
      // Ease out expo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(eased * value);
      el.textContent = `${prefix}${current.toLocaleString()}${suffix}`;
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }, [value, prefix, suffix, duration]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {prefix}0{suffix}
    </span>
  );
}

/**
 * Bento Grid Item — a premium glass card with hover glow border, for feature grids.
 */
export function BentoCard({
  children,
  className = "",
  glowColor = "var(--amber)",
}: {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}) {
  return (
    <motion.div
      className={`relative overflow-hidden rounded-2xl border border-[var(--b2)] bg-[var(--s0)] backdrop-blur-xl p-6 group ${className}`}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
        style={{
          background: `radial-gradient(400px at 50% 50%, ${glowColor}22, transparent 70%)`,
        }}
        aria-hidden
      />
      <DotGridBackground />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
