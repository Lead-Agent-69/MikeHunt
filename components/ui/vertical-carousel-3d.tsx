"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { cn } from "@/lib/utils";

export interface VerticalCarouselItem {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  category?: string;
  description?: string;
}

interface VerticalCarousel3DProps {
  items: VerticalCarouselItem[];
  autoPlay?: boolean;
  autoPlaySpeed?: number;
  cardWidth?: number;
  cardHeight?: number;
  verticalSpacing?: number;
  backgroundBlur?: number;
  overlayOpacity?: number;
  damping?: number;
  className?: string;
}

export function VerticalCarousel3D({
  items,
  autoPlay = true,
  autoPlaySpeed = 3000,
  cardWidth = 320,
  cardHeight = 420,
  verticalSpacing = 20,
  backgroundBlur = 20,
  overlayOpacity = 0.6,
  damping = 15,
  className,
}: VerticalCarousel3DProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragY = useMotionValue(0);
  const startY = useRef(0);

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
  }, []);

  const handleDrag = useCallback((_: any, info: { delta: { y: number } }) => {
    dragY.set(dragY.get() + info.delta.y);
  }, [dragY]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    const currentY = dragY.get();
    const itemHeight = cardHeight + verticalSpacing;
    const indexShift = Math.round(-currentY / itemHeight);
    const newIndex = ((activeIndex + indexShift) % itemCount + itemCount) % itemCount;

    animate(dragY, -newIndex * itemHeight, {
      type: "spring",
      stiffness: 300,
      damping,
    });

    setActiveIndex(newIndex);
  }, [activeIndex, itemCount, cardHeight, verticalSpacing, dragY, damping]);

  // Wheel handling
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY;
    const itemHeight = cardHeight + verticalSpacing;
    const newIndex = ((activeIndex + (delta > 0 ? 1 : -1)) % itemCount + itemCount) % itemCount;
    setActiveIndex(newIndex);
    animate(dragY, -newIndex * itemHeight, {
      type: "spring",
      stiffness: 300,
      damping,
    });
  }, [activeIndex, itemCount, cardHeight, verticalSpacing, dragY, damping]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        const newIndex = ((activeIndex - 1) % itemCount + itemCount) % itemCount;
        setActiveIndex(newIndex);
        animate(dragY, -newIndex * (cardHeight + verticalSpacing), { type: "spring", stiffness: 300, damping });
      } else if (e.key === "ArrowDown") {
        const newIndex = (activeIndex + 1) % itemCount;
        setActiveIndex(newIndex);
        animate(dragY, -newIndex * (cardHeight + verticalSpacing), { type: "spring", stiffness: 300, damping });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, itemCount, cardHeight, verticalSpacing, dragY, damping]);

  // Calculate 3D transforms
  const getItemStyle = (index: number) => {
    const relativeIndex = ((index - activeIndex) % itemCount + itemCount) % itemCount;
    const normalizedIndex = relativeIndex > itemCount / 2 ? relativeIndex - itemCount : relativeIndex;

    const z = -Math.abs(normalizedIndex) * 150;
    const y = normalizedIndex * (cardHeight + verticalSpacing) * 0.3;
    const rotateX = normalizedIndex * 10;
    const scale = 1 - Math.abs(normalizedIndex) * 0.06;
    const opacity = Math.max(0.3, 1 - Math.abs(normalizedIndex) * 0.15);

    return { z, y, rotateX, scale, opacity, zIndex: itemCount - Math.abs(normalizedIndex) };
  };

  // Background items for blur effect
  const backgroundItems = items.filter((_, i) => i !== activeIndex).slice(0, 3);

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full overflow-hidden", className)}
      style={{ perspective: "1200px" }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Vertical image carousel"
      tabIndex={0}
    >
      {/* Blurred background */}
      <div className="absolute inset-0 flex items-center justify-center">
        <AnimatePresence mode="popLayout">
          {backgroundItems.map((item, i) => (
            <motion.div
              key={`bg-${item.id}`}
              className="absolute rounded-[var(--r4)] overflow-hidden"
              style={{
                width: cardWidth * 1.2,
                height: cardHeight * 1.2,
                zIndex: 0,
              }}
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 0.3, scale: 1.1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.5 }}
            >
              <img
                src={item.image}
                alt=""
                className="w-full h-full object-cover"
                style={{ filter: `blur(${backgroundBlur}px)` }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Main carousel */}
      <div
        className="relative flex flex-col items-center justify-center"
        style={{ height: cardHeight + 150, transformStyle: "preserve-3d" }}
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
                  width: cardWidth,
                  height: cardHeight,
                  zIndex: style.zIndex,
                  transformStyle: "preserve-3d",
                }}
                initial={false}
                animate={{
                  y: style.y,
                  z: style.z,
                  rotateX: style.rotateX,
                  scale: style.scale,
                  opacity: style.opacity,
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping,
                }}
                drag={isActive && !isPaused ? "y" : false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.1}
                onDragStart={handleDragStart}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                whileHover={{ scale: isActive ? 1.02 : style.scale }}
                role="button"
                tabIndex={isActive ? 0 : -1}
                aria-label={`${item.title}${item.subtitle ? ` - ${item.subtitle}` : ""}`}
              >
                <div
                  className="relative w-full h-full rounded-[var(--r4)] overflow-hidden"
                  style={{
                    boxShadow: "0 25px 80px rgba(0,0,0,0.3)",
                  }}
                >
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />

                  {/* Gradient overlay */}
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"
                    style={{ opacity: overlayOpacity }}
                  />

                  {/* Content */}
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    {item.category && (
                      <span className="inline-block px-2.5 py-1 mb-3 text-[10px] font-bold uppercase tracking-widest text-white/90 bg-white/10 rounded-full backdrop-blur-md">
                        {item.category}
                      </span>
                    )}
                    <h3 className="text-xl font-bold text-white leading-tight mb-1">
                      {item.title}
                    </h3>
                    {item.subtitle && (
                      <p className="text-sm text-white/70">{item.subtitle}</p>
                    )}
                    {item.description && (
                      <p className="mt-3 text-xs text-white/50 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Navigation dots */}
      <div className="flex items-center justify-center gap-2 mt-4">
        {items.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              setActiveIndex(index);
              animate(dragY, -index * (cardHeight + verticalSpacing), { type: "spring", stiffness: 300, damping });
            }}
            className={cn(
              "w-2 h-2 rounded-full transition-all duration-300",
              index === activeIndex
                ? "w-6 bg-[var(--amber)]"
                : "bg-[var(--s4)] hover:bg-[var(--s5)]"
            )}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
