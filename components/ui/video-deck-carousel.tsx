"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export interface VideoDeckItem {
  id: string;
  /** Optional. Without a video the deck shows the poster image and no play control. */
  video?: string;
  poster: string;
  title: string;
  subtitle?: string;
  category?: string;
  description?: string;
  duration?: string;
}

interface VideoDeckCarouselProps {
  items: VideoDeckItem[];
  autoPlay?: boolean;
  autoPlaySpeed?: number;
  className?: string;
}

export function VideoDeckCarousel({
  items,
  autoPlay = true,
  autoPlaySpeed = 6000,
  className,
}: VideoDeckCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const itemCount = items.length;

  useEffect(() => {
    if (!autoPlay || isPaused) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % itemCount);
    }, autoPlaySpeed);
    return () => clearInterval(interval);
  }, [autoPlay, autoPlaySpeed, isPaused, itemCount]);

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying && !isPaused) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, isPaused, activeIndex]);

  const activeItem = items[activeIndex];

  return (
    <div
      className={cn("relative w-full overflow-hidden", className)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Video deck carousel"
      tabIndex={0}
    >
      {/* Main video display */}
      <div className="relative w-full aspect-video rounded-[var(--r4)] overflow-hidden bg-black">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={activeItem.id}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Video, or the poster when the item has none */}
            {activeItem.video ? (
              <video
                ref={videoRef}
                src={activeItem.video}
                poster={activeItem.poster}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeItem.poster}
                alt={activeItem.title}
                className="w-full h-full object-cover"
              />
            )}

            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

            {/* Play button */}
            {activeItem.video && (
              <motion.button
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                onClick={() => {
                  if (videoRef.current) {
                    if (isPlaying) {
                      videoRef.current.pause();
                    } else {
                      videoRef.current.play().catch(() => {});
                    }
                  }
                }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{
                  opacity: isPlaying ? 0 : 1,
                  scale: isPlaying ? 0.8 : 1,
                }}
                transition={{ duration: 0.2 }}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </motion.button>
            )}

            {/* Content */}
            <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                <div className="flex items-center gap-3 mb-3">
                  {activeItem.category && (
                    <span className="inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white bg-white/10 rounded-full backdrop-blur-md">
                      {activeItem.category}
                    </span>
                  )}
                  {activeItem.duration && (
                    <span className="text-xs font-semibold text-white/60">
                      {activeItem.duration}
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
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
          <motion.div
            className="h-full bg-[var(--amber)]"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: autoPlaySpeed / 1000, ease: "linear" }}
            key={activeIndex}
          />
        </div>
      </div>

      {/* Video thumbnails */}
      <div className="flex gap-3 mt-4 overflow-x-auto pb-2 scrollbar-hide">
        {items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => setActiveIndex(index)}
            className={cn(
              "relative flex-shrink-0 w-40 h-24 rounded-xl overflow-hidden transition-all duration-300",
              index === activeIndex
                ? "ring-2 ring-[var(--amber)] ring-offset-2 ring-offset-[var(--s1)]"
                : "opacity-40 hover:opacity-70",
            )}
          >
            <img
              src={item.poster}
              alt={item.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between">
              <span className="text-[10px] font-bold text-white truncate max-w-[80%]">
                {item.title}
              </span>
              {item.duration && (
                <span className="text-[10px] text-white/60">
                  {item.duration}
                </span>
              )}
            </div>
            {/* Play icon */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
