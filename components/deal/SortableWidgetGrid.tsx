"use client";

import React, { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";

export interface WidgetItem {
  id: string;
  content: React.ReactNode;
}

interface SortableWidgetGridProps {
  widgets: WidgetItem[];
  storageKey?: string;
}

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${isDragging ? "shadow-2xl scale-[1.02]" : ""}`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing hover:bg-white/10"
        title="Drag to reorder"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[var(--t3)]"
        >
          <circle cx="9" cy="12" r="1" />
          <circle cx="9" cy="5" r="1" />
          <circle cx="9" cy="19" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="15" cy="5" r="1" />
          <circle cx="15" cy="19" r="1" />
        </svg>
      </div>
      {children}
    </div>
  );
}

export function SortableWidgetGrid({ widgets, storageKey = "deal-widget-order" }: SortableWidgetGridProps) {
  const [items, setItems] = useState<WidgetItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Load saved order from localStorage
    const savedOrder = localStorage.getItem(storageKey);
    if (savedOrder) {
      try {
        const orderIds = JSON.parse(savedOrder) as string[];
        // Reconstruct items array in saved order, falling back to original if new widgets exist
        const orderedItems = orderIds
          .map((id) => widgets.find((w) => w.id === id))
          .filter(Boolean) as WidgetItem[];
        
        // Add any missing widgets that weren't in saved order
        const missing = widgets.filter((w) => !orderIds.includes(w.id));
        setItems([...orderedItems, ...missing]);
      } catch (e) {
        setItems(widgets);
      }
    } else {
      setItems(widgets);
    }
    setMounted(true);
  }, [widgets, storageKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before drag starts (allows clicking inside widget)
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // Require 250ms press to drag on mobile
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);
        
        // Save to localStorage
        localStorage.setItem(storageKey, JSON.stringify(newItems.map(i => i.id)));
        
        return newItems;
      });
    }
  };

  if (!mounted) {
    // Return simple grid before hydration to avoid mismatch
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-min">
        {widgets.map((widget) => (
          <div key={widget.id}>{widget.content}</div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-min">
          {items.map((widget) => (
            <SortableItem key={widget.id} id={widget.id}>
              {widget.content}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
