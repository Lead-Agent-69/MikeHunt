"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence, animate } from "framer-motion";
import { cn } from "@/lib/utils";

export interface FanCardItem {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  category?: string;
}

interface FanCardCarouselProps {
  items: FanCardItem[];
  autoPlay?: boolean;
  autoPlaySpeed?: number;
  maxRotation?: number;
  radius?: number;
  className?: string;
}

export function FanCardCarousel({
  items,
  autoPlay = true,
  autoPlaySpeed = 3000,
  maxRotation = 60,
  radius = 300,
  className,
}: FanCardCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const itemCount = items.length;

  useEffect(() => {
    if (!autoPlay || isPaused) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % itemCount);
    }, autoPlaySpeed);
    return () => clearInterval(interval);
  }, [autoPlay, autoPlaySpeed, isPaused, itemCount]);

  const getCardStyle = (index: number) => {
    const relativeIndex = ((index - activeIndex) % itemCount + itemCount) % itemCount;
    const normalizedIndex = relativeIndex > itemCount / 2 ? relativeIndex - itemCount : relativeIndex;
    const angle = (normalizedIndex / itemCount) * maxRotation * 2 - maxRotation / 2;
    const x = Math.sin((angle * Math.PI) / 180) * radius;
    const z = Math.cos((angle * Math.PI) / 180) * radius - radius;
    const scale = 1 - Math.abs(normalizedIndex) * 0.05;
    const opacity = Math.max(0.3, 1 - Math.abs(normalizedIndex) * 0.15);

    return { x, z, angle, scale, opacity, zIndex: itemCount - Math.abs(normalizedIndex) };
  };

  return (
    <div
      className={cn("relative w-full overflow-hidden", className)}
      style={{ perspective: "1200px", height: 450 }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Fan card carousel"
      tabIndex={0}
    >
      <div className="relative w-full h-full flex items-center justify-center" style={{ transformStyle: "preserve-3d" }}>
        <AnimatePresence>
          {items.map((item, index) => {
            const style = getCardStyle(index);
            const isActive = index === activeIndex;

            return (
              <motion.div
                key={item.id}
                className="absolute w-64 h-80 rounded-[var(--r4)] overflow-hidden cursor-pointer"
                style={{ zIndex: style.zIndex, transformStyle: "preserve-3d" }}
                initial={false}
                animate={{
                  x: style.x,
                  z: style.z,
                  rotateZ: style.angle,
                  scale: style.scale,
                  opacity: style.opacity,
                }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                whileHover={{ scale: 1.05, z: style.z + 50 }}
                onClick={() => setActiveIndex(index)}
                role="button"
                tabIndex={isActive ? 0 : -1}
                aria-label={item.title}
              >
                <div className="relative w-full h-full">
                  <img src={item.image} alt={item.title} className="w-full h-full object-cover" draggable={false} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    {item.category && (
                      <span className="inline-block px-2 py-0.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-white/80 bg-white/10 rounded-full">
                        {item.category}
                      </span>
                    )}
                    <h3 className="text-base font-bold text-white">{item.title}</h3>
                    {item.subtitle && <p className="text-xs text-white/60">{item.subtitle}</p>}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-2 mt-4">
        {items.map((_, index) => (
          <button
            key={index}
            onClick={() => setActiveIndex(index)}
            className={cn(
              "w-2 h-2 rounded-full transition-all duration-300",
              index === activeIndex ? "w-6 bg-[var(--amber)]" : "bg-[var(--s4)] hover:bg-[var(--s5)]"
            )}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
