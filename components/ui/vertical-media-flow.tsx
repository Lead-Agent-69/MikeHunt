"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useScroll, useTransform, useMotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

export interface VerticalMediaItem {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  category?: string;
  description?: string;
}

interface VerticalMediaFlowProps {
  items: VerticalMediaItem[];
  className?: string;
}

export function VerticalMediaFlow({ items, className }: VerticalMediaFlowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Update active index based on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerCenter = containerRect.top + containerRect.height / 2;

      let closestIndex = 0;
      let closestDistance = Infinity;

      items.forEach((_, index) => {
        const item = container.querySelector(`[data-index="${index}"]`);
        if (item) {
          const itemRect = item.getBoundingClientRect();
          const itemCenter = itemRect.top + itemRect.height / 2;
          const distance = Math.abs(itemCenter - containerCenter);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
          }
        }
      });

      setActiveIndex(closestIndex);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [items]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Sticky display */}
      <div className="sticky top-20 h-[70vh] flex items-center justify-center">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={items[activeIndex].id}
            className="absolute w-full max-w-2xl aspect-[4/3] rounded-[var(--r4)] overflow-hidden"
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -50 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src={items[activeIndex].image}
              alt={items[activeIndex].title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              {items[activeIndex].category && (
                <span className="inline-block px-3 py-1 mb-2 text-[10px] font-bold uppercase tracking-widest text-white bg-white/10 rounded-full backdrop-blur-md">
                  {items[activeIndex].category}
                </span>
              )}
              <h3 className="text-2xl font-bold text-white">{items[activeIndex].title}</h3>
              {items[activeIndex].subtitle && (
                <p className="text-sm text-white/70">{items[activeIndex].subtitle}</p>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Scroll trigger items */}
      <div className="relative z-10">
        {items.map((item, index) => (
          <div
            key={item.id}
            data-index={index}
            className="h-[60vh] flex items-center justify-center"
          >
            <div className="max-w-md text-center px-6">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                {item.category && (
                  <span className="inline-block px-3 py-1 mb-3 text-[10px] font-bold uppercase tracking-widest text-[var(--amber)] bg-[var(--amber-lo)] rounded-full">
                    {item.category}
                  </span>
                )}
                <h3 className="text-xl font-bold text-[var(--t1)] mb-2">{item.title}</h3>
                {item.subtitle && <p className="text-sm text-[var(--t4)]">{item.subtitle}</p>}
                {item.description && (
                  <p className="mt-3 text-sm text-[var(--t3)]">{item.description}</p>
                )}
              </motion.div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
