"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";

/** Photo taps must never turn a scroll, swipe, pinch, or nested control into a second move. */
export function usePhotoNavigation(
  move: (direction: -1 | 1) => void,
  { enabled, swipe = false }: { enabled: boolean; swipe?: boolean },
) {
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    maxX: number;
    maxY: number;
    startedAt: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const nestedControl = (event: {
    target: EventTarget;
    currentTarget: HTMLElement;
  }) => {
    const control = (event.target as Element).closest?.(
      "button, a, input, select, textarea, [role='button']",
    );
    return (
      control &&
      control !== event.currentTarget &&
      event.currentTarget.contains(control)
    );
  };

  return {
    onPointerDownCapture(event: PointerEvent<HTMLElement>) {
      if (
        event.button !== 0 ||
        event.isPrimary === false ||
        nestedControl(event)
      ) {
        gesture.current = null;
        suppressClick.current = true;
        return;
      }
      suppressClick.current = false;
      gesture.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        maxX: 0,
        maxY: 0,
        startedAt: Date.now(),
      };
    },
    onPointerMoveCapture(event: PointerEvent<HTMLElement>) {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId) return;
      start.maxX = Math.max(start.maxX, Math.abs(event.clientX - start.x));
      start.maxY = Math.max(start.maxY, Math.abs(event.clientY - start.y));
    },
    onPointerUpCapture(event: PointerEvent<HTMLElement>) {
      const start = gesture.current;
      gesture.current = null;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const movedX = Math.max(start.maxX, Math.abs(dx));
      const movedY = Math.max(start.maxY, Math.abs(dy));
      const held = Date.now() - start.startedAt > 500;
      suppressClick.current = movedX > 10 || movedY > 10 || held;
      if (enabled && swipe && !held && Math.abs(dx) >= 50 && movedY <= 20) {
        move(dx < 0 ? 1 : -1);
      }
    },
    onPointerCancelCapture() {
      gesture.current = null;
      suppressClick.current = true;
    },
    onClick(event: MouseEvent<HTMLElement>) {
      if (nestedControl(event)) return;
      if (suppressClick.current) {
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // Keyboard/assistive activation keeps the element's normal action; visible arrows are buttons.
      if (
        !enabled ||
        event.detail === 0 ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (!(bounds.width > 0)) return;
      event.preventDefault();
      event.stopPropagation();
      move(event.clientX < bounds.left + bounds.width / 2 ? -1 : 1);
    },
  };
}
