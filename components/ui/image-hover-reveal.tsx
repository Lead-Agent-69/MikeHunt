"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ImageHoverRevealItem {
  id: string;
  image: string;
  hoverImage: string;
  title: string;
  subtitle?: string;
  category?: string;
}

interface ImageHoverRevealProps {
  item: ImageHoverRevealItem;
  className?: string;
}

export function ImageHoverReveal({ item, className }: ImageHoverRevealProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn("relative w-full aspect-[4/3] rounded-[var(--r4)] overflow-hidden cursor-pointer", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="button"
      tabIndex={0}
      aria-label={item.title}
    >
      {/* Base image */}
      <motion.img
        src={item.image}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover"
        animate={{ opacity: isHovered ? 0 : 1, scale: isHovered ? 1.1 : 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Hover image */}
      <motion.img
        src={item.hoverImage}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0, scale: isHovered ? 1 : 1.1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        {item.category && (
          <span className="inline-block px-2 py-0.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-white/80 bg-white/10 rounded-full">
            {item.category}
          </span>
        )}
        <h3 className="text-base font-bold text-white">{item.title}</h3>
        {item.subtitle && <p className="text-xs text-white/60">{item.subtitle}</p>}
      </div>

      {/* Hover indicator */}
      <motion.div
        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: isHovered ? 1 : 0, scale: isHovered ? 1 : 0.8 }}
        transition={{ duration: 0.2 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </motion.div>
    </div>
  );
}

// ── Image Hover Reveal Grid ──
interface ImageHoverRevealGridProps {
  items: ImageHoverRevealItem[];
  columns?: 2 | 3 | 4;
  className?: string;
}

export function ImageHoverRevealGrid({ items, columns = 3, className }: ImageHoverRevealGridProps) {
  return (
    <div
      className={cn("grid gap-4", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {items.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: index * 0.05 }}
        >
          <ImageHoverReveal item={item} />
        </motion.div>
      ))}
    </div>
  );
}
