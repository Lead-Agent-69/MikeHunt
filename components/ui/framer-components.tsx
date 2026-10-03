"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useAnimationFrame,
  animate,
  AnimatePresence,
} from "framer-motion";
import { CheckCircle2, X, Heart } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// 1. TEXT REVEAL — Characters slide up into view on scroll, like Framer's
//    "Text Reveal" component (the most popular on the marketplace).
// ─────────────────────────────────────────────────────────────────────────────

export function TextReveal({
  text,
  className = "",
  delay = 0,
  once = true,
}: {
  text: string;
  className?: string;
  delay?: number;
  once?: boolean;
}) {
  const words = text.split(" ");
  return (
    <span className={`inline-flex flex-wrap gap-x-[0.25em] ${className}`}>
      {words.map((word, wi) => (
        <span key={wi} className="overflow-hidden inline-flex">
          <motion.span
            className="inline-block"
            initial={{ y: "110%", opacity: 0 }}
            whileInView={{ y: "0%", opacity: 1 }}
            viewport={{ once, margin: "-10% 0px" }}
            transition={{
              delay: delay + wi * 0.06,
              duration: 0.55,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

// Character-by-character variant for hero headlines
export function TextRevealChars({
  text,
  className = "",
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const chars = text.split("");
  return (
    <span className={`inline-flex flex-wrap ${className}`} aria-label={text}>
      {chars.map((char, i) => (
        <span key={i} className="overflow-hidden inline-flex" aria-hidden>
          <motion.span
            className="inline-block"
            initial={{ y: "110%", rotateX: -30 }}
            whileInView={{ y: "0%", rotateX: 0 }}
            viewport={{ once: true, margin: "-5% 0px" }}
            transition={{
              delay: delay + i * 0.03,
              duration: 0.5,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {char === " " ? "\u00A0" : char}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. LIQUID GLASS BUTTONS — the iOS 26 / visionOS-style liquid glass effect
// ─────────────────────────────────────────────────────────────────────────────

export function LiquidGlassButton({
  children,
  onClick,
  href,
  className = "",
  variant = "default",
  size = "md",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
  variant?: "default" | "primary" | "danger" | "success";
  size?: "sm" | "md" | "lg";
}) {
  const variantStyles: Record<string, string> = {
    default: "border-white/20 text-white",
    primary: "border-[var(--amber)]/40 text-[var(--amber)]",
    danger: "border-red-400/40 text-red-400",
    success: "border-green-400/40 text-green-400",
  };

  const sizeStyles: Record<string, string> = {
    sm: "px-4 py-2 text-xs gap-1.5 rounded-xl",
    md: "px-6 py-3 text-sm gap-2 rounded-2xl",
    lg: "px-8 py-4 text-base gap-2.5 rounded-2xl",
  };

  // Rendered as a real anchor when given an href — previously Tag was computed but the JSX
  // used a plain div, so every link-style CTA was inert and never navigated.
  const Tag = (href ? "a" : "button") as React.ElementType;

  return (
    <motion.div
      className={`relative group ${className}`}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <Tag
        href={href}
        type={href ? undefined : "button"}
        onClick={onClick}
        className={`
          relative inline-flex items-center font-bold cursor-pointer select-none
          border backdrop-blur-2xl overflow-hidden
          ${variantStyles[variant]} ${sizeStyles[size]}
        `}
        style={{
          background: `linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0.08) 100%)`,
          boxShadow: `
            inset 0 1px 0 rgba(255,255,255,0.2),
            inset 0 -1px 0 rgba(0,0,0,0.1),
            0 4px 16px rgba(0,0,0,0.2),
            0 1px 4px rgba(0,0,0,0.1)
          `,
        }}
      >
        {/* Shimmer sweep on hover */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)`,
            x: "-100%",
          }}
          whileHover={{ x: "200%" }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        />

        {/* Top highlight */}
        <div className="absolute top-0 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent rounded-full pointer-events-none" />

        {/* Content */}
        <span className="relative z-10 flex items-center gap-inherit">
          {children}
        </span>
      </Tag>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. PILL DROPDOWN NAV — floating pill-shaped nav with animated active state
// ─────────────────────────────────────────────────────────────────────────────

export function PillDropdownNav({
  items,
  activeKey,
  onChange,
}: {
  items: { key: string; label: string; icon?: string }[];
  activeKey: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-full border border-white/10"
      style={{
        background: "rgba(255,255,255,0.06)",
        backdropFilter: "blur(24px)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.3)",
      }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className="relative px-4 py-1.5 rounded-full text-sm font-semibold transition-colors duration-200 z-10 flex items-center gap-1.5"
          style={{
            color: activeKey === item.key ? "#fff" : "var(--t4)",
          }}
        >
          {activeKey === item.key && (
            <motion.div
              layoutId="pill-active"
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "linear-gradient(135deg, var(--amber), var(--purple))",
                boxShadow: "0 0 12px rgba(242,91,154,0.4)",
              }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          {item.icon && <span className="relative z-10">{item.icon}</span>}
          <span className="relative z-10">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. INTERACTIVE PATTERN — mouse-reactive SVG dot grid (like the Framer component)
// ─────────────────────────────────────────────────────────────────────────────

export function InteractivePattern({
  className = "",
  dotColor = "var(--b2)",
  glowColor = "rgba(242,91,154,0.6)",
  gridSize = 30,
}: {
  className?: string;
  dotColor?: string;
  glowColor?: string;
  gridSize?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      const cols = Math.ceil(w / gridSize) + 1;
      const rows = Math.ceil(h / gridSize) + 1;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * gridSize;
          const y = r * gridSize;
          const dist = Math.hypot(
            x - mouseRef.current.x,
            y - mouseRef.current.y,
          );
          const radius = Math.max(1, 5 - dist / 30);
          const glow = Math.max(0, 1 - dist / 150);

          if (glow > 0.01) {
            ctx.shadowBlur = 8 * glow;
            ctx.shadowColor = glowColor;
            ctx.fillStyle = `rgba(242,91,154,${0.8 * glow})`;
          } else {
            ctx.shadowBlur = 0;
            ctx.fillStyle = dotColor;
          }

          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, radius), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [dotColor, glowColor, gridSize]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-auto ${className}`}
      aria-hidden
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. 3D FLIPPING BOOK / CARD — like the Framer "3D Flipping Book" component
//    Used to show deal details front/back in a tactile flip animation.
// ─────────────────────────────────────────────────────────────────────────────

export function FlipCard({
  front,
  back,
  className = "",
  height = 220,
}: {
  front: React.ReactNode;
  back: React.ReactNode;
  className?: string;
  height?: number;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className={`relative cursor-pointer ${className}`}
      style={{ height, perspective: "1200px" }}
      onClick={() => setFlipped((f) => !f)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && setFlipped((f) => !f)}
      aria-label="Click to flip card"
    >
      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden border border-[var(--b2)] bg-[var(--s0)]"
          style={{ backfaceVisibility: "hidden" }}
        >
          {front}
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden border border-[var(--b2)] bg-[var(--s0)]"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {back}
        </div>
      </motion.div>

      {/* Flip hint */}
      <div className="absolute bottom-2 right-3 text-[10px] text-[var(--t5)] font-mono pointer-events-none select-none">
        {flipped ? "← flip back" : "tap to flip →"}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. REAL FOLDER — 3D stacked paper folder with hover lift animation
//    Inspired by the Framer "Real Folder" component.
// ─────────────────────────────────────────────────────────────────────────────

export function RealFolder({
  label,
  count,
  color = "var(--amber)",
  children,
  className = "",
}: {
  label: string;
  count?: number;
  color?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      className={`relative cursor-pointer select-none ${className}`}
      style={{ width: 160, height: 140 }}
      whileHover={{ scale: 1.04 }}
      onClick={() => setOpen((o) => !o)}
    >
      {/* Tab */}
      <div
        className="absolute top-0 left-3 w-16 h-5 rounded-t-lg"
        style={{ background: color, opacity: 0.9 }}
      />

      {/* Stacked sheets behind */}
      {[3, 2, 1].map((n) => (
        <motion.div
          key={n}
          className="absolute bottom-0 left-0 right-0 rounded-xl border"
          style={{
            height: "calc(100% - 10px)",
            background: `rgba(255,255,255,${0.03 * n})`,
            borderColor: `${color}33`,
            bottom: n * 3,
            left: n * 2,
            right: n * 2,
          }}
          animate={{ y: open ? -n * 12 : 0, rotate: open ? n * 3 : 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        />
      ))}

      {/* Main folder body */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 rounded-xl border flex flex-col items-center justify-center gap-2"
        style={{
          height: "calc(100% - 10px)",
          background: `linear-gradient(160deg, ${color}22 0%, ${color}11 100%)`,
          borderColor: `${color}55`,
          backdropFilter: "blur(12px)",
        }}
        animate={{ y: open ? -8 : 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      >
        <span className="text-2xl">📁</span>
        <span className="text-xs font-bold text-[var(--t2)] text-center px-2 leading-tight">
          {label}
        </span>
        {count !== undefined && (
          <span
            className="text-[10px] font-black px-2 py-0.5 rounded-full"
            style={{ background: color, color: "#000" }}
          >
            {count}
          </span>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. LIQUID GLASS FOOTER — frosted glass footer panel
// ─────────────────────────────────────────────────────────────────────────────

export function LiquidGlassFooter({
  brandName = "MikeHunt",
  links = [],
  tagline = "Auto flip intelligence.",
}: {
  brandName?: string;
  links?: { label: string; href: string }[];
  tagline?: string;
}) {
  return (
    <footer className="relative overflow-hidden">
      {/* Background blur strip */}
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(32px)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      />

      {/* Inner highlight */}
      <div className="absolute top-0 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-black"
            style={{ background: "var(--grad)" }}
          >
            M
          </div>
          <div>
            <div className="text-sm font-black text-[var(--t1)]">
              {brandName}
            </div>
            <div className="text-xs text-[var(--t5)]">{tagline}</div>
          </div>
        </div>

        {/* Links */}
        {links.length > 0 && (
          <nav className="flex items-center gap-6">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-xs font-semibold text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>
        )}

        {/* Copyright */}
        <div className="text-xs text-[var(--t5)] font-mono">
          © {new Date().getFullYear()} {brandName}
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. PARALLAX SECTION WRAPPER — scroll-driven parallax for sections
// ─────────────────────────────────────────────────────────────────────────────

export function ParallaxSection({
  children,
  speed = 0.3,
  className = "",
}: {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    [`${-speed * 80}px`, `${speed * 80}px`],
  );

  return (
    <div ref={ref} className={`overflow-hidden ${className}`}>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. LENIS SMOOTH SCROLL PROVIDER — wraps the app in buttery smooth scrolling
// ─────────────────────────────────────────────────────────────────────────────

export function LenisSmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let lenis: any;
    // `lenis` is the maintained package — @studio-freight/lenis was renamed and is deprecated.
    // The constructor options below (duration/easing/touchMultiplier) are API-identical.
    import("lenis" as any)
      .then((mod: any) => {
        const LenisCtor = mod.default || mod.Lenis || mod;
        if (!LenisCtor) return;
        lenis = new LenisCtor({
          duration: 1.2,
          easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          touchMultiplier: 2,
        });

        function raf(time: number) {
          lenis?.raf(time);
          requestAnimationFrame(raf);
        }
        requestAnimationFrame(raf);
      })
      .catch(() => {});

    return () => {
      if (lenis?.destroy) lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. DRAGGABLE DEAL CARD STACK — drag and stack deal cards like the "Real Folder" /
//     "Draggable Masonry" concept — swipe right=save, left=pass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The draggable top card. Owns its own x motion value so the tilt and the SAVE/PASS stamps
 * track the live drag, and so a freshly-mounted card always starts centered.
 */
function SwipeCardFace({
  card,
  onDecide,
}: {
  card: { id: string; content: React.ReactNode };
  onDecide: (id: string, dir: "save" | "pass") => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-9, 9]);
  const saveOpacity = useTransform(x, [24, 130], [0, 1]);
  const passOpacity = useTransform(x, [-24, -130], [0, 1]);

  return (
    <motion.div
      className="absolute inset-0 z-20 touch-none cursor-grab active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={(_, info) => {
        if (info.offset.x > 120) onDecide(card.id, "save");
        else if (info.offset.x < -120) onDecide(card.id, "pass");
      }}
      whileDrag={{ scale: 1.03 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[var(--r4)] border border-[var(--b2)] bg-[var(--s0)] shadow-[var(--shadow)]">
        {card.content}
      </div>

      {/* Stamps fade in proportionally to the drag, so the outcome reads before you commit. */}
      <motion.span
        className="pointer-events-none absolute left-4 top-4 rounded-full border px-3 py-1 text-xs font-black"
        style={{
          opacity: saveOpacity,
          borderColor: "var(--gbd)",
          background: "var(--glo)",
          color: "var(--green)",
        }}
      >
        SAVE ✓
      </motion.span>
      <motion.span
        className="pointer-events-none absolute right-4 top-4 rounded-full border px-3 py-1 text-xs font-black"
        style={{
          opacity: passOpacity,
          borderColor: "var(--rbd)",
          background: "var(--rlo)",
          color: "var(--red)",
        }}
      >
        PASS ✗
      </motion.span>
    </motion.div>
  );
}

export function SwipeCardStack({
  cards,
  onSave,
  onPass,
  height = 380,
}: {
  cards: { id: string; content: React.ReactNode }[];
  onSave: (id: string) => void;
  onPass: (id: string) => void;
  height?: number;
}) {
  const [stack, setStack] = useState(cards);
  // A newly-fetched batch has to replace the queue — seeding state once would freeze the
  // stack on whatever cards existed at first mount.
  useEffect(() => {
    setStack(cards);
  }, [cards]);

  // The card flying off, rendered above the incoming one so departure and arrival never
  // fight for the same slot.
  const [leaving, setLeaving] = useState<{
    card: { id: string; content: React.ReactNode };
    dir: "save" | "pass";
  } | null>(null);

  const decide = useCallback(
    (id: string, dir: "save" | "pass") => {
      const card = stack.find((c) => c.id === id);
      if (!card || leaving) return;
      if (dir === "save") onSave(id);
      else onPass(id);
      setStack((s) => s.filter((c) => c.id !== id));
      setLeaving({ card, dir });
    },
    [stack, leaving, onSave, onPass],
  );

  const top = stack[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="relative select-none" style={{ height }}>
        {/* Queue waiting behind the top card */}
        {stack.slice(1, 4).map((card, i) => (
          <div
            key={card.id}
            aria-hidden
            className="absolute inset-x-0 top-0 overflow-hidden rounded-[var(--r4)] border border-[var(--b2)] bg-[var(--s0)]"
            style={{
              height: "100%",
              transform: `translateY(${(i + 1) * 9}px) scale(${1 - (i + 1) * 0.03})`,
              opacity: 1 - (i + 1) * 0.28,
              zIndex: 10 - i,
            }}
          />
        ))}

        {/* Keyed by id so the next card mounts fresh instead of inheriting the drag offset. */}
        {top && <SwipeCardFace key={top.id} card={top} onDecide={decide} />}

        {leaving && (
          <motion.div
            className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[var(--r4)] border border-[var(--b2)] bg-[var(--s0)]"
            initial={{ x: 0, opacity: 1, rotate: 0 }}
            animate={{
              x: leaving.dir === "save" ? 620 : -620,
              opacity: 0,
              rotate: leaving.dir === "save" ? 16 : -16,
            }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={() => setLeaving(null)}
          >
            {leaving.card.content}
          </motion.div>
        )}

        {!top && !leaving && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[var(--r4)] border border-dashed border-[var(--b2)] text-center">
            <CheckCircle2
              className="h-8 w-8 text-[var(--green)]"
              aria-hidden="true"
            />
            <p className="text-sm font-bold text-[var(--t2)]">All caught up</p>
            <p className="px-6 text-xs text-[var(--t4)]">
              Every deal in this batch has a decision.
            </p>
          </div>
        )}
      </div>

      {/* Drag is the fast path; these give keyboard and assistive-tech users the same two
          decisions without needing a pointer. */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => top && decide(top.id, "pass")}
          disabled={!top}
          aria-label="Pass on this deal"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--b2)] bg-[var(--s0)] px-5 py-2.5 text-[13px] font-bold text-[var(--t3)] transition-all hover:border-[var(--rbd)] hover:text-[var(--red)] active:scale-95 disabled:opacity-40"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
          Pass
        </button>
        <span className="font-mono text-[11px] text-[var(--t5)]">
          {stack.length} left
        </span>
        <button
          type="button"
          onClick={() => top && decide(top.id, "save")}
          disabled={!top}
          aria-label="Save this deal"
          className="inline-flex items-center gap-1.5 rounded-full px-6 py-2.5 text-[13px] font-black text-white shadow-[var(--shadow2)] transition-all hover:scale-[1.03] active:scale-95 disabled:opacity-40"
          style={{ background: "var(--grad)" }}
        >
          <Heart className="h-4 w-4" strokeWidth={2.5} />
          Save
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. LIQUID METAL BUTTON+ — Metallic chrome liquid sheen with mouse specular highlight
// ─────────────────────────────────────────────────────────────────────────────

export function LiquidMetalButton({
  children,
  onClick,
  href,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const btnRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  const content = (
    <motion.div
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      className={`relative inline-flex items-center justify-center px-7 py-3.5 rounded-2xl font-black text-sm text-white overflow-hidden cursor-pointer shadow-xl ${className}`}
      style={{
        background: `radial-gradient(circle at ${mousePos.x}% ${mousePos.y}%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 60%), linear-gradient(135deg, #2a2a32 0%, #121217 50%, #000000 100%)`,
        border: "1px solid rgba(255, 255, 255, 0.25)",
        boxShadow:
          "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
      }}
      onMouseMove={handleMouseMove}
    >
      {/* Liquid metal sheen animation */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
        }}
        animate={{ x: ["-100%", "200%"] }}
        transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
      />
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </motion.div>
  );

  if (href) {
    return (
      <a ref={btnRef as any} href={href} className="inline-block">
        {content}
      </a>
    );
  }

  return (
    <button
      ref={btnRef as any}
      onClick={onClick}
      type="button"
      className="inline-block"
    >
      {content}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. SWITCH ON HOVER TABS — Instant hover tab switching with dynamic layoutId
// ─────────────────────────────────────────────────────────────────────────────

export function SwitchOnHoverTabs({
  tabs,
  activeKey,
  onChange,
}: {
  tabs: { key: string; label: string; count?: number }[];
  activeKey: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 p-1.5 rounded-2xl border border-[var(--b2)] bg-[var(--s0)]/80 backdrop-blur-xl">
      {tabs.map((tab) => {
        const active = activeKey === tab.key;
        return (
          <button
            key={tab.key}
            onMouseEnter={() => onChange(tab.key)}
            onClick={() => onChange(tab.key)}
            className="relative px-4 py-2 rounded-xl text-xs font-bold transition-colors z-10 flex items-center gap-2 select-none"
            style={{ color: active ? "#ffffff" : "var(--t3)" }}
          >
            {active && (
              <motion.div
                layoutId="hover-tab-bg"
                className="absolute inset-0 rounded-xl"
                style={{
                  background: "var(--grad)",
                  boxShadow: "0 0 16px rgba(242,91,154,0.3)",
                }}
                transition={{ type: "spring", stiffness: 450, damping: 32 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`relative z-10 text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                  active
                    ? "bg-white/20 text-white"
                    : "bg-[var(--s2)] text-[var(--t4)]"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. FILTERABLE GALLERY — Isotope-style animated media grid with Framer layout
// ─────────────────────────────────────────────────────────────────────────────

export function FilterableGallery({
  categories,
  items,
}: {
  categories: { key: string; label: string }[];
  items: { id: string; category: string; content: React.ReactNode }[];
}) {
  const [activeCat, setActiveCat] = useState("all");

  const filtered =
    activeCat === "all" ? items : items.filter((i) => i.category === activeCat);

  return (
    <div className="space-y-6">
      {/* Category selector */}
      <div className="flex justify-center">
        <SwitchOnHoverTabs
          tabs={[{ key: "all", label: "All Items" }, ...categories]}
          activeKey={activeCat}
          onChange={setActiveCat}
        />
      </div>

      {/* Grid with Layout animation */}
      <motion.div
        layout
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        <AnimatePresence>
          {filtered.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              {item.content}
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. DNA CAROUSEL — a 3D helix ring that spins on its own, pauses on hover,
//     drags to spin, and snaps a card to the front on click.
//     Inspired by the Framer marketplace "DNA Carousel" component.
// ─────────────────────────────────────────────────────────────────────────────

export function DNACarousel({
  items,
  radius = 300,
  height = 340,
  cardWidth = 230,
}: {
  items: { id: string; content: React.ReactNode }[];
  radius?: number;
  height?: number;
  cardWidth?: number;
}) {
  const rotation = useMotionValue(0);
  const [paused, setPaused] = useState(false);
  const drag = useRef<{ on: boolean; x: number }>({ on: false, x: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  // Shrink the whole ring on narrow screens so side cards don't bleed off-canvas.
  const [fit, setFit] = useState(1);
  const angle = 360 / Math.max(items.length, 1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const needed = 2 * (radius + cardWidth / 2) + 24;
    const compute = () => setFit(Math.min(1, el.clientWidth / needed));
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [radius, cardWidth]);

  useAnimationFrame((_, delta) => {
    if (!paused && !drag.current.on)
      rotation.set(rotation.get() - delta * 0.012);
  });

  // Snap the clicked card to the front, spinning whichever way is shorter.
  const focus = (i: number) => {
    const target = -i * angle;
    const current = rotation.get();
    const diff = ((((target - current) % 360) + 540) % 360) - 180;
    animate(rotation, current + diff, {
      type: "spring",
      stiffness: 55,
      damping: 15,
    });
  };

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto w-full max-w-4xl touch-pan-y select-none"
      style={{ height, perspective: 1400 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        setPaused(false);
        drag.current.on = false;
      }}
      onPointerDown={(e) => {
        drag.current = { on: true, x: e.clientX };
      }}
      onPointerMove={(e) => {
        if (!drag.current.on) return;
        rotation.set(rotation.get() + (e.clientX - drag.current.x) * 0.4);
        drag.current.x = e.clientX;
      }}
      onPointerUp={() => {
        drag.current.on = false;
      }}
      onPointerCancel={() => {
        drag.current.on = false;
      }}
    >
      <motion.div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{ rotateY: rotation, scale: fit, transformStyle: "preserve-3d" }}
      >
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => focus(i)}
            aria-label={`Bring card ${i + 1} to the front`}
            className="absolute left-1/2 top-1/2"
            style={{
              width: cardWidth,
              marginLeft: -cardWidth / 2,
              marginTop: -height / 2,
              height: height - 60,
              transform: `rotateY(${i * angle}deg) translateZ(${radius}px) translateY(${
                Math.sin((i * angle * Math.PI) / 180) * 22
              }px)`,
              backfaceVisibility: "hidden",
            }}
          >
            {item.content}
          </button>
        ))}
      </motion.div>

      {/* Floor glow — sells the 3D stage without costing a render pass. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[15%] bottom-0 h-10 rounded-[50%] blur-2xl"
        style={{ background: "var(--amber-lo)" }}
      />
    </div>
  );
}
