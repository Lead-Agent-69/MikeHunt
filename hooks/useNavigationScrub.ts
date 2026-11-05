"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import { useMotionValue } from "framer-motion";

/** Preview while dragging; commit once on release. Ordinary links and keyboard activation stay native. */
export function useNavigationScrub(
  selected: number,
  count: number,
  route: string,
  navigate: (index: number) => void,
) {
  const position = useMotionValue(Math.max(0, selected));
  const dragging = useMotionValue(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [pressed, setPressed] = useState(false);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    dragged: boolean;
    element: HTMLElement;
  } | null>(null);
  const suppressClick = useRef(false);
  const current = useRef({ selected, navigate });
  current.current = { selected, navigate };

  function release() {
    const start = gesture.current;
    gesture.current = null;
    if (start?.element.hasPointerCapture?.(start.id)) {
      start.element.releasePointerCapture(start.id);
    }
  }
  function clearPending() {
    if (pending.current !== null) clearTimeout(pending.current);
    pending.current = null;
  }
  function reset() {
    clearPending();
    release();
    dragging.set(false);
    position.set(Math.max(0, current.current.selected));
    setPreview(null);
    setPressed(false);
  }
  function activate(index: number) {
    clearPending();
    position.set(index);
    setPreview(index);
    if (index !== current.current.selected)
      pending.current = setTimeout(reset, 4000);
    else setPreview(null);
  }
  useEffect(() => {
    // A route change (including browser Back) invalidates any in-flight gesture.
    release();
    dragging.set(false);
    position.set(Math.max(0, selected));
    setPreview(null);
    setPressed(false);
    const cancel = () => {
      suppressClick.current = true;
      clearPending();
      release();
      dragging.set(false);
      position.set(Math.max(0, current.current.selected));
      setPreview(null);
      setPressed(false);
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
      clearPending();
      release();
    };
  }, [selected, route, count, position, dragging]);

  function point(event: PointerEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const width = (bounds.width - 8) / count;
    if (width <= 0) return null;
    const inside =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top - 16 &&
      event.clientY <= bounds.bottom + 16;
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const offset = rtl
      ? bounds.right - event.clientX
      : event.clientX - bounds.left;
    const raw = (offset - 4) / width - 0.5;
    return { inside, value: Math.max(0, Math.min(count - 1, raw)) };
  }

  return {
    position,
    dragging,
    activate,
    preview,
    pressed,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.isPrimary === false) {
          suppressClick.current = true;
          reset();
          return;
        }
        suppressClick.current = false;
        if (
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.shiftKey
        )
          return;
        clearPending();
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          dragged: false,
          element: event.currentTarget,
        };
        setPressed(true);
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = Math.abs(event.clientX - start.x);
        const dy = Math.abs(event.clientY - start.y);
        // A vertical exit is cancellation, never a navigation or a trapped page scroll.
        if (!start.dragged && dy > 10 && dy > dx) {
          suppressClick.current = true;
          reset();
          return;
        }
        if (!start.dragged && dx <= 8) return;
        if (!start.dragged) {
          start.dragged = true;
          dragging.set(true);
          suppressClick.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }
        const target = point(event);
        if (!target) return;
        position.set(target.value);
        setPreview(Math.round(target.value));
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const target = point(event);
        const index = target ? Math.round(target.value) : -1;
        const commit = start.dragged && target?.inside && index >= 0;
        if (commit && index !== current.current.selected) {
          release();
          dragging.set(false);
          setPressed(false);
          activate(index);
          current.current.navigate(index);
        } else if (start.dragged) {
          reset();
        } else {
          release();
          setPressed(false);
        }
      },
      onPointerCancel() {
        suppressClick.current = true;
        reset();
      },
      onPointerLeave() {
        // Mouse can leave before it travels far enough to claim pointer capture.
        if (gesture.current && !gesture.current.dragged) {
          suppressClick.current = true;
          reset();
        }
      },
      onLostPointerCapture() {
        if (gesture.current) reset();
      },
      onKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (event.key === "Escape") {
          suppressClick.current = true;
          reset();
        } else if (event.key === "Enter") {
          // Firefox gives keyboard-generated clicks detail=1, just like mouse clicks.
          suppressClick.current = false;
        }
      },
      onClickCapture(event: MouseEvent<HTMLElement>) {
        // Browsers synthesize a click after pointerup; do not follow the origin link too.
        if (suppressClick.current && event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onContextMenu(event: MouseEvent<HTMLElement>) {
        // Keep mouse context menus; prevent the touch long-press callout during a scrub.
        if (gesture.current) event.preventDefault();
      },
    },
  };
}
