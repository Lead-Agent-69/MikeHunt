"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  animate,
} from "framer-motion";
import { cn } from "@/lib/utils";

export interface CarouselItem {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  category?: string;
  year?: string;
  description?: string;
  cta?: string;
  ctaLink?: string;
}

interface DNACarouselProps {
  items: CarouselItem[];
  autoPlay?: boolean;
  autoPlaySpeed?: number;
  depth?: number;
  curve?: number;
  helixSpread?: number;
  perspective?: number;
  rotation?: number;
  tilt?: number;
  blur?: number;
  rgbSplit?: number;
  inactiveOpacity?: number;
  shadow?: boolean;
  shadowStrength?: number;
  grabCursor?: boolean;
  imageRadius?: number;
  imageWidth?: number;
  imageHeight?: number;
  gap?: number;
  dragSensitivity?: number;
  inertia?: number;
  snapStrength?: number;
  className?: string;
}

export function DNACarousel({
  items,
  autoPlay = true,
  autoPlaySpeed = 3000,
  depth = 300,
  curve = 1,
  helixSpread = 1,
  perspective = 1000,
  rotation = 0,
  tilt = 0,
  blur = 8,
  rgbSplit = 3,
  inactiveOpacity = 0.4,
  shadow = true,
  shadowStrength = 0.3,
  grabCursor = true,
  imageRadius = 16,
  imageWidth = 280,
  imageHeight = 380,
  gap = 24,
  dragSensitivity = 1,
  inertia = 0.95,
  snapStrength = 0.1,
  className,
}: DNACarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragX = useMotionValue(0);
  const velocity = useRef(0);
  const lastX = useRef(0);
  const animationRef = useRef<number>();

  const itemCount = items.length;

  // Auto-play
  useEffect(() => {
    if (!autoPlay || isPaused || isDragging) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % itemCount);
    }, autoPlaySpeed);
    return () => clearInterval(interval);
  }, [autoPlay, autoPlaySpeed, isPaused, isDragging, itemCount]);

  // Drag handling
  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  }, []);

  const handleDrag = useCallback(
    (_: any, info: { delta: { x: number } }) => {
      dragX.set(dragX.get() + info.delta.x * dragSensitivity);
      velocity.current = info.delta.x * dragSensitivity;
    },
    [dragSensitivity, dragX],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    const currentX = dragX.get();
    const itemWidth = imageWidth + gap;
    const indexShift = Math.round(-currentX / itemWidth);
    const newIndex =
      (((activeIndex + indexShift) % itemCount) + itemCount) % itemCount;

    // Animate to snap position
    animate(dragX, -newIndex * itemWidth, {
      type: "spring",
      stiffness: 300,
      damping: 30,
    });

    setActiveIndex(newIndex);
  }, [activeIndex, itemCount, imageWidth, gap, dragX]);

  // Wheel handling
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY + e.deltaX;
      const itemWidth = imageWidth + gap;
      const newIndex =
        (((activeIndex + (delta > 0 ? 1 : -1)) % itemCount) + itemCount) %
        itemCount;
      setActiveIndex(newIndex);
      animate(dragX, -newIndex * itemWidth, {
        type: "spring",
        stiffness: 300,
        damping: 30,
      });
    },
    [activeIndex, itemCount, imageWidth, gap, dragX],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        const newIndex =
          (((activeIndex - 1) % itemCount) + itemCount) % itemCount;
        setActiveIndex(newIndex);
        animate(dragX, -newIndex * (imageWidth + gap), {
          type: "spring",
          stiffness: 300,
          damping: 30,
        });
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        const newIndex = (activeIndex + 1) % itemCount;
        setActiveIndex(newIndex);
        animate(dragX, -newIndex * (imageWidth + gap), {
          type: "spring",
          stiffness: 300,
          damping: 30,
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, itemCount, imageWidth, gap, dragX]);

  // Calculate 3D transforms for each item
  const getItemStyle = (index: number) => {
    const relativeIndex =
      (((index - activeIndex) % itemCount) + itemCount) % itemCount;
    const normalizedIndex =
      relativeIndex > itemCount / 2 ? relativeIndex - itemCount : relativeIndex;

    const z = -Math.abs(normalizedIndex) * depth * 0.3;
    const x = normalizedIndex * (imageWidth + gap) * 0.5 * helixSpread;
    const rotateY = normalizedIndex * 15 * curve;
    const rotateX = tilt;
    const scale = 1 - Math.abs(normalizedIndex) * 0.08;
    const opacity = Math.max(
      inactiveOpacity,
      1 - Math.abs(normalizedIndex) * 0.2,
    );
    const blurAmount = Math.abs(normalizedIndex) * blur * 0.5;
    const rgbOffset = Math.abs(normalizedIndex) * rgbSplit;

    return {
      z,
      x,
      rotateY,
      rotateX,
      scale,
      opacity,
      filter: `blur(${blurAmount}px)`,
      zIndex: itemCount - Math.abs(normalizedIndex),
      rgbOffset,
    };
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full overflow-hidden", className)}
      style={{ perspective: `${perspective}px` }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Image carousel"
      tabIndex={0}
    >
      <div
        className="relative flex items-center justify-center"
        style={{ height: imageHeight + 100, transformStyle: "preserve-3d" }}
      >
        <AnimatePresence>
          {items.map((item, index) => {
            const style = getItemStyle(index);
            const isActive = index === activeIndex;

            return (
              <motion.div
                key={item.id}
                className="absolute"
                style={{
                  width: imageWidth,
                  height: imageHeight,
                  zIndex: style.zIndex,
                  transformStyle: "preserve-3d",
                }}
                initial={false}
                animate={{
                  x: style.x,
                  y: 0,
                  z: style.z,
                  rotateY: style.rotateY,
                  rotateX: style.rotateX,
                  scale: style.scale,
                  opacity: style.opacity,
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                }}
                drag={isActive && !isPaused ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.1}
                onDragStart={handleDragStart}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                whileHover={{ scale: isActive ? 1.02 : style.scale }}
                whileTap={{ scale: 0.98 }}
                role="button"
                tabIndex={isActive ? 0 : -1}
                aria-label={`${item.title}${item.subtitle ? ` - ${item.subtitle}` : ""}`}
              >
                {/* RGB Split layers */}
                {rgbSplit > 0 && (
                  <>
                    <div
                      className="absolute inset-0 rounded-[var(--r4)] overflow-hidden"
                      style={{
                        transform: `translateX(${-style.rgbOffset}px)`,
                        opacity: 0.5,
                        mixBlendMode: "screen",
                      }}
                    >
                      <img
                        src={item.image}
                        alt=""
                        className="w-full h-full object-cover"
                        style={{ filter: "url(#red-channel)" }}
                      />
                    </div>
                    <div
                      className="absolute inset-0 rounded-[var(--r4)] overflow-hidden"
                      style={{
                        transform: `translateX(${style.rgbOffset}px)`,
                        opacity: 0.5,
                        mixBlendMode: "screen",
                      }}
                    >
                      <img
                        src={item.image}
                        alt=""
                        className="w-full h-full object-cover"
                        style={{ filter: "url(#blue-channel)" }}
                      />
                    </div>
                  </>
                )}

                {/* Main image */}
                <div
                  className="relative w-full h-full rounded-[var(--r4)] overflow-hidden"
                  style={{
                    borderRadius: imageRadius,
                    boxShadow: shadow
                      ? `0 ${20 * shadowStrength}px ${60 * shadowStrength}px rgba(0,0,0,${shadowStrength})`
                      : "none",
                  }}
                >
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Content */}
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    {item.category && (
                      <span className="inline-block px-2 py-0.5 mb-2 text-[10px] font-bold uppercase tracking-wider text-white/80 bg-white/10 rounded-full backdrop-blur-sm">
                        {item.category}
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-white leading-tight mb-1">
                      {item.title}
                    </h3>
                    {item.subtitle && (
                      <p className="text-sm text-white/70">{item.subtitle}</p>
                    )}
                    {item.description && (
                      <p className="mt-2 text-xs text-white/60 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    {item.cta && item.ctaLink && (
                      <a
                        href={item.ctaLink}
                        target={
                          item.ctaLink.startsWith("http") ? "_blank" : undefined
                        }
                        rel={
                          item.ctaLink.startsWith("http")
                            ? "noopener noreferrer"
                            : undefined
                        }
                        className="mt-3 inline-flex px-4 py-2 text-xs font-bold text-white bg-white/10 rounded-full backdrop-blur-sm hover:bg-white/20 transition-colors"
                      >
                        {item.cta}
                      </a>
                    )}
                    {item.cta && !item.ctaLink && (
                      <button className="mt-3 px-4 py-2 text-xs font-bold text-white bg-white/10 rounded-full backdrop-blur-sm hover:bg-white/20 transition-colors">
                        {item.cta}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Navigation dots */}
      <div className="flex items-center justify-center gap-2 mt-6">
        {items.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              setActiveIndex(index);
              animate(dragX, -index * (imageWidth + gap), {
                type: "spring",
                stiffness: 300,
                damping: 30,
              });
            }}
            className={cn(
              "w-2 h-2 rounded-full transition-all duration-300",
              index === activeIndex
                ? "w-6 bg-[var(--amber)]"
                : "bg-[var(--s4)] hover:bg-[var(--s5)]",
            )}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* SVG filters for RGB split */}
      <svg className="absolute w-0 h-0">
        <defs>
          <filter id="red-channel">
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            />
          </filter>
          <filter id="blue-channel">
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            />
          </filter>
        </defs>
      </svg>
    </div>
  );
}
