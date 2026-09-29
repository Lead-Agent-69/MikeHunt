"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface EditorialCardData {
  id: string;
  image: string;
  video?: string;
  title: string;
  category: string;
  year: string;
  description: string;
  cta?: string;
  ctaLink?: string;
}

interface EditorialCardProps {
  data: EditorialCardData;
  variant?: "default" | "wide" | "tall" | "compact";
  showVideo?: boolean;
  className?: string;
}

export function EditorialCard({
  data,
  variant = "default",
  showVideo = false,
  className,
}: EditorialCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const variants = {
    default: { width: "100%", aspectRatio: "4/3" },
    wide: { width: "100%", aspectRatio: "16/9" },
    tall: { width: "100%", aspectRatio: "3/4" },
    compact: { width: "100%", aspectRatio: "1/1" },
  };

  const currentVariant = variants[variant];

  return (
    <motion.div
      className={cn("relative group cursor-pointer", className)}
      style={{ aspectRatio: currentVariant.aspectRatio }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsVideoPlaying(false); }}
      whileHover={{ y: -8 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      {/* Image/Video container */}
      <div className="relative w-full h-full rounded-[var(--r4)] overflow-hidden">
        {/* Main image */}
        <motion.img
          src={data.image}
          alt={data.title}
          className="w-full h-full object-cover"
          animate={{
            scale: isHovered ? 1.05 : 1,
          }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* Video overlay */}
        {showVideo && data.video && isHovered && (
          <motion.video
            src={data.video}
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          />
        )}

        {/* Gradient overlay */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"
          initial={{ opacity: 0.6 }}
          animate={{ opacity: isHovered ? 0.8 : 0.6 }}
          transition={{ duration: 0.3 }}
        />

        {/* Category badge */}
        <motion.div
          className="absolute top-4 left-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: isHovered ? 1 : 0.7, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white bg-white/10 rounded-full backdrop-blur-md">
            {data.category}
          </span>
        </motion.div>

        {/* Year badge */}
        <motion.div
          className="absolute top-4 right-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: isHovered ? 1 : 0.7, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <span className="inline-block px-2 py-1 text-[10px] font-bold text-white/70 bg-black/20 rounded-full backdrop-blur-md">
            {data.year}
          </span>
        </motion.div>

        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <motion.h3
            className="text-lg font-bold text-white leading-tight mb-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: isHovered ? 1 : 0.9, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            {data.title}
          </motion.h3>

          <motion.p
            className="text-sm text-white/60 line-clamp-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : 10 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            {data.description}
          </motion.p>

          {data.cta && (
            <motion.button
              className="mt-3 px-4 py-2 text-xs font-bold text-white bg-white/10 rounded-full backdrop-blur-md hover:bg-white/20 transition-colors"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : 10 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              onClick={(e) => {
                e.stopPropagation();
                if (data.ctaLink) window.location.href = data.ctaLink;
              }}
            >
              {data.cta}
            </motion.button>
          )}
        </div>

        {/* Hover border effect */}
        <motion.div
          className="absolute inset-0 rounded-[var(--r4)] border-2 border-white/0"
          animate={{
            borderColor: isHovered ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0)",
          }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </motion.div>
  );
}

// ── Editorial Card Stack ──
interface EditorialCardStackProps {
  items: EditorialCardData[];
  className?: string;
}

export function EditorialCardStack({ items, className }: EditorialCardStackProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {items.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          <EditorialCard data={item} />
        </motion.div>
      ))}
    </div>
  );
}

// ── Editorial Grid ──
interface EditorialGridProps {
  items: EditorialCardData[];
  columns?: 2 | 3 | 4;
  className?: string;
}

export function EditorialGrid({ items, columns = 3, className }: EditorialGridProps) {
  return (
    <div
      className={cn("grid gap-6", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {items.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
        >
          <EditorialCard data={item} />
        </motion.div>
      ))}
    </div>
  );
}
