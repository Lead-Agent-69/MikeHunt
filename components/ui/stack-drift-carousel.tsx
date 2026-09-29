"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence, animate } from "framer-motion";
import { cn } from "@/lib/utils";

export interface StackDriftItem {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  category?: string;
  description?: string;
}

interface StackDriftCarouselProps {
  items: StackDriftItem[];
  autoPlay?: boolean;
  autoPlaySpeed?: number;
  className?: string;
}

export function StackDriftCarousel({
  items,
  autoPlay = true,
  autoPlaySpeed = 3000,
  className,
}: StackDriftCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [direction, setDirection] = useState(1);
  const itemCount = items.length;

  useEffect(() => {
    if (!autoPlay || isPaused) return;
    const interval = setInterval(() => {
      setDirection(1);
      setActiveIndex((prev) => (prev + 1) % itemCount);
    }, autoPlaySpeed);
    return () => clearInterval(interval);
  }, [autoPlay, autoPlaySpeed, isPaused, itemCount]);

  const goTo = (index: number) => {
    setDirection(index > activeIndex ? 1 : -1);
    setActiveIndex(index);
  };

  const goNext = () => {
    setDirection(1);
    setActiveIndex((prev) => (prev + 1) % itemCount);
  };

  const goPrev = () => {
    setDirection(-1);
    setActiveIndex((prev) => (prev - 1 + itemCount) % itemCount);
  };

  // Get visible items (previous, active, next)
  const getVisibleItems = () => {
    const prev = (activeIndex - 1 + itemCount) % itemCount;
    const next = (activeIndex + 1) % itemCount;
    return [
      { item: items[prev], position: -1, index: prev },
      { item: items[activeIndex], position: 0, index: activeIndex },
      { item: items[next], position: 1, index: next },
    ];
  };

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? "100%" : "-100%",
      opacity: 0,
      scale: 0.8,
      rotateZ: dir > 0 ? 5 : -5,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      rotateZ: 0,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? "-100%" : "100%",
      opacity: 0,
      scale: 0.8,
      rotateZ: dir > 0 ? -5 : 5,
    }),
  };

  return (
    <div
      className={cn("relative w-full overflow-hidden", className)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Stack drift carousel"
      tabIndex={0}
    >
      {/* Main display */}
      <div className="relative w-full aspect-[16/10] md:aspect-[21/9] rounded-[var(--r4)] overflow-hidden">
        <AnimatePresence mode="popLayout" custom={direction}>
          <motion.div
            key={items[activeIndex].id}
            className="absolute inset-0"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <img src={items[activeIndex].image} alt={items[activeIndex].title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

            {/* Content */}
            <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                {items[activeIndex].category && (
                  <span className="inline-block px-3 py-1 mb-3 text-[10px] font-bold uppercase tracking-widest text-white bg-white/10 rounded-full backdrop-blur-md">
                    {items[activeIndex].category}
                  </span>
                )}
                <h2 className="text-2xl md:text-4xl font-bold text-white mb-2">{items[activeIndex].title}</h2>
                {items[activeIndex].subtitle && <p className="text-sm md:text-base text-white/70">{items[activeIndex].subtitle}</p>}
                {items[activeIndex].description && (
                  <p className="mt-3 text-sm text-white/50 max-w-xl line-clamp-2">{items[activeIndex].description}</p>
                )}
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation arrows */}
        <button
          onClick={goPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          aria-label="Previous slide"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          onClick={goNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          aria-label="Next slide"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* Stacked cards preview */}
      <div className="flex justify-center gap-3 mt-6">
        {getVisibleItems().map(({ item, position, index }) => (
          <button
            key={item.id}
            onClick={() => goTo(index)}
            className={cn(
              "relative w-24 h-16 rounded-lg overflow-hidden transition-all duration-300",
              position === 0
                ? "ring-2 ring-[var(--amber)] ring-offset-2 ring-offset-[var(--s1)] scale-105"
                : "opacity-40 hover:opacity-70 scale-95"
            )}
            style={{
              transform: `translateY(${position * 8}px) rotate(${position * 2}deg)`,
            }}
          >
            <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {/* Progress indicators */}
      <div className="flex items-center justify-center gap-2 mt-4">
        {items.map((_, index) => (
          <button
            key={index}
            onClick={() => goTo(index)}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              index === activeIndex ? "w-8 bg-[var(--amber)]" : "w-1.5 bg-[var(--s4)] hover:bg-[var(--s5)]"
            )}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
