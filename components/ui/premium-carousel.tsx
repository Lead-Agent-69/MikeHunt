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

export interface PremiumCarouselItem {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  category?: string;
  description?: string;
  price?: string;
  year?: string;
  mileage?: string;
  cta?: string;
}

interface PremiumCarouselProps {
  items: PremiumCarouselItem[];
  autoPlay?: boolean;
  autoPlaySpeed?: number;
  className?: string;
}

export function PremiumCarousel({
  items,
  autoPlay = true,
  autoPlaySpeed = 4000,
  className,
}: PremiumCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [direction, setDirection] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragX = useMotionValue(0);
  const itemCount = items.length;

  // Auto-play
  useEffect(() => {
    if (!autoPlay || isPaused) return;
    const interval = setInterval(() => {
      setDirection(1);
      setActiveIndex((prev) => (prev + 1) % itemCount);
    }, autoPlaySpeed);
    return () => clearInterval(interval);
  }, [autoPlay, autoPlaySpeed, isPaused, itemCount]);

  // Drag handling
  const handleDragEnd = useCallback(() => {
    const currentX = dragX.get();
    const threshold = 100;
    if (currentX > threshold) {
      setDirection(-1);
      setActiveIndex((prev) => (prev - 1 + itemCount) % itemCount);
    } else if (currentX < -threshold) {
      setDirection(1);
      setActiveIndex((prev) => (prev + 1) % itemCount);
    }
    animate(dragX, 0, { type: "spring", stiffness: 300, damping: 30 });
  }, [dragX, itemCount]);

  // Wheel handling
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY + e.deltaX;
      if (Math.abs(delta) > 10) {
        const newDir = delta > 0 ? 1 : -1;
        setDirection(newDir);
        setActiveIndex((prev) => (prev + newDir + itemCount) % itemCount);
      }
    },
    [itemCount],
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
      if (e.key === "ArrowLeft") {
        setDirection(-1);
        setActiveIndex((prev) => (prev - 1 + itemCount) % itemCount);
      } else if (e.key === "ArrowRight") {
        setDirection(1);
        setActiveIndex((prev) => (prev + 1) % itemCount);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, itemCount]);

  const activeItem = items[activeIndex];

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 300 : -300,
      opacity: 0,
      scale: 0.9,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -300 : 300,
      opacity: 0,
      scale: 0.9,
    }),
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full overflow-hidden", className)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Premium carousel"
      tabIndex={0}
    >
      {/* Main display */}
      <div className="relative w-full aspect-[16/10] md:aspect-[21/9] rounded-[var(--r4)] overflow-hidden">
        <AnimatePresence mode="popLayout" custom={direction}>
          <motion.div
            key={activeItem.id}
            className="absolute inset-0"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.1}
            onDragEnd={handleDragEnd}
          >
            <img
              src={activeItem.image}
              alt={activeItem.title}
              className="w-full h-full object-cover"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

            {/* Content */}
            <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="max-w-2xl"
              >
                <div className="flex items-center gap-3 mb-3">
                  {activeItem.category && (
                    <span className="inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white bg-white/10 rounded-full backdrop-blur-md">
                      {activeItem.category}
                    </span>
                  )}
                  {activeItem.year && (
                    <span className="text-xs font-semibold text-white/60">
                      {activeItem.year}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl md:text-4xl font-bold text-white mb-2">
                  {activeItem.title}
                </h2>
                {activeItem.subtitle && (
                  <p className="text-sm md:text-base text-white/70">
                    {activeItem.subtitle}
                  </p>
                )}
                {activeItem.description && (
                  <p className="mt-3 text-sm text-white/50 max-w-xl line-clamp-2">
                    {activeItem.description}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-4">
                  {activeItem.price && (
                    <span className="text-xl md:text-2xl font-bold text-[var(--amber)]">
                      {activeItem.price}
                    </span>
                  )}
                  {activeItem.mileage && (
                    <span className="text-sm text-white/50">
                      {activeItem.mileage}
                    </span>
                  )}
                  {activeItem.cta && (
                    <button className="px-5 py-2.5 text-sm font-bold text-white bg-[image:var(--grad)] rounded-full hover:opacity-90 transition-opacity">
                      {activeItem.cta}
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation arrows */}
        <button
          onClick={() => {
            setDirection(-1);
            setActiveIndex((prev) => (prev - 1 + itemCount) % itemCount);
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          aria-label="Previous slide"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          onClick={() => {
            setDirection(1);
            setActiveIndex((prev) => (prev + 1) % itemCount);
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          aria-label="Next slide"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-3 mt-4 overflow-x-auto pb-2 scrollbar-hide">
        {items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => {
              setDirection(index > activeIndex ? 1 : -1);
              setActiveIndex(index);
            }}
            className={cn(
              "relative flex-shrink-0 w-36 h-24 rounded-xl overflow-hidden transition-all duration-300",
              index === activeIndex
                ? "ring-2 ring-[var(--amber)] ring-offset-2 ring-offset-[var(--s1)]"
                : "opacity-40 hover:opacity-70",
            )}
          >
            <img
              src={item.image}
              alt={item.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <span className="absolute bottom-1 left-2 right-2 text-[10px] font-bold text-white truncate">
              {item.title}
            </span>
          </button>
        ))}
      </div>

      {/* Progress indicators */}
      <div className="flex items-center justify-center gap-2 mt-4">
        {items.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              setDirection(index > activeIndex ? 1 : -1);
              setActiveIndex(index);
            }}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              index === activeIndex
                ? "w-8 bg-[var(--amber)]"
                : "w-1.5 bg-[var(--s4)] hover:bg-[var(--s5)]",
            )}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
