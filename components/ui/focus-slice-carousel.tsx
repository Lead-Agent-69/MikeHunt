"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export interface FocusSliceItem {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  category?: string;
  description?: string;
}

interface FocusSliceCarouselProps {
  items: FocusSliceItem[];
  autoPlay?: boolean;
  autoPlaySpeed?: number;
  className?: string;
}

export function FocusSliceCarousel({
  items,
  autoPlay = true,
  autoPlaySpeed = 4000,
  className,
}: FocusSliceCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [sliceCount, setSliceCount] = useState(5);
  const itemCount = items.length;

  useEffect(() => {
    if (!autoPlay || isPaused) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % itemCount);
    }, autoPlaySpeed);
    return () => clearInterval(interval);
  }, [autoPlay, autoPlaySpeed, isPaused, itemCount]);

  const activeItem = items[activeIndex];

  return (
    <div
      className={cn("relative w-full overflow-hidden", className)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Focus slice carousel"
      tabIndex={0}
    >
      {/* Main display */}
      <div className="relative w-full aspect-[16/9] md:aspect-[21/9] rounded-[var(--r4)] overflow-hidden">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={activeItem.id}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <img src={activeItem.image} alt={activeItem.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

            {/* Content */}
            <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                {activeItem.category && (
                  <span className="inline-block px-3 py-1 mb-3 text-[10px] font-bold uppercase tracking-widest text-white bg-white/10 rounded-full backdrop-blur-md">
                    {activeItem.category}
                  </span>
                )}
                <h2 className="text-2xl md:text-4xl font-bold text-white mb-2">{activeItem.title}</h2>
                {activeItem.subtitle && <p className="text-sm md:text-base text-white/70">{activeItem.subtitle}</p>}
                {activeItem.description && (
                  <p className="mt-3 text-sm text-white/50 max-w-xl line-clamp-2">{activeItem.description}</p>
                )}
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Slice indicators */}
        <div className="absolute top-4 right-4 flex gap-1">
          {items.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveIndex(index)}
              className={cn(
                "w-1.5 h-8 rounded-full transition-all duration-300",
                index === activeIndex ? "bg-white" : "bg-white/30 hover:bg-white/50"
              )}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
        {items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => setActiveIndex(index)}
            className={cn(
              "relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden transition-all duration-300",
              index === activeIndex
                ? "ring-2 ring-[var(--amber)] ring-offset-2 ring-offset-[var(--s1)]"
                : "opacity-50 hover:opacity-80"
            )}
          >
            <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
