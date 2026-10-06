"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface PolaroidFlipItem {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  category?: string;
  description?: string;
  backImage?: string;
}

interface PolaroidFlipCardProps {
  item: PolaroidFlipItem;
  className?: string;
}

export function PolaroidFlipCard({ item, className }: PolaroidFlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div
      className={cn("relative w-64 h-80 cursor-pointer", className)}
      style={{ perspective: "1000px" }}
      onClick={() => setIsFlipped(!isFlipped)}
      role="button"
      tabIndex={0}
      aria-label={`${item.title} - click to flip`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setIsFlipped(!isFlipped);
      }}
    >
      <motion.div
        className="relative w-full h-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 bg-white rounded-lg shadow-xl overflow-hidden"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="relative w-full h-56">
            <img
              src={item.image}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="p-4">
            {item.category && (
              <span className="inline-block px-2 py-0.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--amber)] bg-[var(--amber-lo)] rounded-full">
                {item.category}
              </span>
            )}
            <h3 className="text-base font-bold text-[var(--t1)]">
              {item.title}
            </h3>
            {item.subtitle && (
              <p className="text-xs text-[var(--t4)]">{item.subtitle}</p>
            )}
          </div>
          {/* Tape effect */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-6 bg-yellow-200/60 rotate-2 rounded-sm" />
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 bg-white rounded-lg shadow-xl overflow-hidden p-6"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="h-full flex flex-col">
            {item.backImage && (
              <div className="relative w-full h-32 rounded-lg overflow-hidden mb-4">
                <img
                  src={item.backImage}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <h3 className="text-lg font-bold text-[var(--t1)] mb-2">
              {item.title}
            </h3>
            {item.description && (
              <p className="text-sm text-[var(--t3)] flex-1">
                {item.description}
              </p>
            )}
            <div className="mt-4 pt-4 border-t border-[var(--b1)]">
              <p className="text-xs text-[var(--t5)]">Tap to flip back</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Polaroid Grid ──
interface PolaroidGridProps {
  items: PolaroidFlipItem[];
  className?: string;
}

// A fresh random tilt on every render gave the server and the browser different transforms, so
// /showcase hydrated with mismatched styles. A per-index hash keeps the scatter but is identical
// on both sides. Rounded to 0.1deg so both serialize the same string.
export function polaroidTilt(index: number, salt: number, spread: number) {
  const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  const unit = x - Math.floor(x);
  return Math.round((unit * 2 - 1) * spread * 10) / 10;
}

export function PolaroidGrid({ items, className }: PolaroidGridProps) {
  return (
    <div className={cn("flex flex-wrap gap-6 justify-center", className)}>
      {items.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 30, rotate: polaroidTilt(index, 1, 5) }}
          whileInView={{ opacity: 1, y: 0, rotate: polaroidTilt(index, 2, 3) }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: index * 0.1 }}
        >
          <PolaroidFlipCard item={item} />
        </motion.div>
      ))}
    </div>
  );
}
