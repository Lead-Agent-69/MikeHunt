"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export interface DrawerCardItem {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  category?: string;
  description?: string;
  specs?: Array<{ label: string; value: string }>;
}

interface UIDrawerCardProps {
  item: DrawerCardItem;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export function UIDrawerCard({
  item,
  isOpen,
  onClose,
  className,
}: UIDrawerCardProps) {
  return (
    <>
      {/* Card trigger */}
      <motion.div
        className={cn(
          "relative w-full aspect-[4/3] rounded-[var(--r4)] overflow-hidden cursor-pointer",
          className,
        )}
        onClick={onClose}
        whileHover={{ y: -5 }}
        role="button"
        tabIndex={0}
        aria-label={`${item.title} - click to open details`}
      >
        <img
          src={item.image}
          alt={item.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          {item.category && (
            <span className="inline-block px-2 py-0.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-white/80 bg-white/10 rounded-full">
              {item.category}
            </span>
          )}
          <h3 className="text-base font-bold text-white">{item.title}</h3>
          {item.subtitle && (
            <p className="text-xs text-white/60">{item.subtitle}</p>
          )}
        </div>
      </motion.div>

      {/* Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/50 z-[90]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />

            {/* Drawer panel */}
            <motion.div
              className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-0 md:right-0 md:left-auto md:h-full md:w-[400px] bg-[var(--s0)] z-[95] rounded-t-[var(--r4)] md:rounded-none overflow-y-auto"
              initial={{ y: "100%", x: 0 }}
              animate={{ y: 0, x: 0 }}
              exit={{ y: "100%", x: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {/* Handle (mobile) */}
              <div className="md:hidden w-10 h-1 bg-[var(--s4)] rounded-full mx-auto mt-3" />

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[var(--s2)] flex items-center justify-center text-[var(--t3)] hover:bg-[var(--s3)] transition-colors z-10"
                aria-label="Close"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>

              {/* Image */}
              <div className="relative w-full aspect-video">
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>

              {/* Content */}
              <div className="p-6">
                {item.category && (
                  <span className="inline-block px-3 py-1 mb-3 text-[10px] font-bold uppercase tracking-widest text-[var(--amber)] bg-[var(--amber-lo)] rounded-full">
                    {item.category}
                  </span>
                )}
                <h2 className="text-2xl font-bold text-[var(--t1)] mb-2">
                  {item.title}
                </h2>
                {item.subtitle && (
                  <p className="text-sm text-[var(--t4)] mb-4">
                    {item.subtitle}
                  </p>
                )}
                {item.description && (
                  <p className="text-sm text-[var(--t3)] leading-relaxed mb-6">
                    {item.description}
                  </p>
                )}

                {/* Specs */}
                {item.specs && item.specs.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-[var(--t2)] uppercase tracking-wider">
                      Specifications
                    </h3>
                    {item.specs.map((spec, index) => (
                      <div
                        key={index}
                        className="flex justify-between py-2 border-b border-[var(--b1)]"
                      >
                        <span className="text-sm text-[var(--t4)]">
                          {spec.label}
                        </span>
                        <span className="text-sm font-semibold text-[var(--t1)]">
                          {spec.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* CTA */}
                <button className="w-full mt-6 py-3 text-sm font-bold text-white bg-[image:var(--grad)] rounded-xl hover:opacity-90 transition-opacity">
                  View Full Details
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Drawer Card Grid ──
interface DrawerCardGridProps {
  items: DrawerCardItem[];
  columns?: 2 | 3 | 4;
  className?: string;
}

export function DrawerCardGrid({
  items,
  columns = 3,
  className,
}: DrawerCardGridProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openItem = items.find((i) => i.id === openId);

  return (
    <>
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
            <UIDrawerCard
              item={item}
              isOpen={false}
              onClose={() => setOpenId(item.id)}
            />
          </motion.div>
        ))}
      </div>

      {/* Drawer for selected item */}
      {openItem && (
        <UIDrawerCard
          item={openItem}
          isOpen={true}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
