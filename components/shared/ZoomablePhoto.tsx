"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { usePhotoNavigation } from "@/hooks/usePhotoNavigation";

type View = { src: string; scale: number; x: number; y: number };
const fit = (src: string): View => ({ src, scale: 1, x: 0, y: 0 });

/** Shared full-photo gestures. Zoom never advances a photo or dismisses its viewer. */
export function ZoomablePhoto({
  src,
  alt,
  move,
  multiple,
  onDismiss,
  onPhotoLoad,
}: {
  src: string;
  alt: string;
  move: (direction: -1 | 1) => void;
  multiple: boolean;
  onDismiss: () => void;
  onPhotoLoad?: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [view, setView] = useState(() => fit(src));
  const current = view.src === src ? view : fit(src);
  const currentView = useRef(current);
  currentView.current = current;
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ x: number; y: number; view: View } | null>(null);
  const pinch = useRef<{ distance: number; view: View } | null>(null);
  const suppressClick = useRef(false);
  const [dismissOffset, setDismissOffset] = useState(0);
  const navigation = usePhotoNavigation(move, {
    enabled: multiple,
    swipe: true,
  });
  const ready = loaded === src && failed !== src;

  const constrain = (next: View) => {
    const width = frame.current?.clientWidth || 0;
    const height = frame.current?.clientHeight || 0;
    const maxX = Math.max(
      0,
      ((image.current?.clientWidth || width) * next.scale - width) / 2,
    );
    const maxY = Math.max(
      0,
      ((image.current?.clientHeight || height) * next.scale - height) / 2,
    );
    return {
      ...next,
      scale: Math.min(4, Math.max(1, next.scale)),
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  };
  const update = (next: View) => {
    currentView.current = constrain(next);
    setView(currentView.current);
  };
  const zoom = (scale: number) => {
    if (!ready) return;
    const next = Math.min(4, Math.max(1, scale));
    update(next === 1 ? fit(src) : { ...currentView.current, scale: next });
  };
  const zoomAction = useRef(zoom);
  zoomAction.current = zoom;
  const updateAction = useRef(update);
  updateAction.current = update;

  useEffect(() => {
    setView(fit(src));
    setDismissOffset(0);
    pointers.current.clear();
    pan.current = null;
    pinch.current = null;
  }, [src]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target as Element)?.closest?.("input, textarea, select")
      )
        return;
      const active = currentView.current;
      const step = ["+", "="].includes(event.key)
        ? 0.5
        : ["-", "_"].includes(event.key)
          ? -0.5
          : 0;
      if (step || event.key === "0") {
        event.preventDefault();
        event.stopImmediatePropagation();
        zoomAction.current(event.key === "0" ? 1 : active.scale + step);
      } else if (active.scale > 1 && event.key.startsWith("Arrow")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        updateAction.current({
          ...active,
          x:
            active.x +
            (event.key === "ArrowLeft"
              ? 40
              : event.key === "ArrowRight"
                ? -40
                : 0),
          y:
            active.y +
            (event.key === "ArrowUp"
              ? 40
              : event.key === "ArrowDown"
                ? -40
                : 0),
        });
      }
    };
    const resize = () => updateAction.current(currentView.current);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const distance = () => {
    const [a, b] = Array.from(pointers.current.values());
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const finish = (event: PointerEvent<HTMLDivElement>, canceled = false) => {
    const wasPinch = pinch.current !== null;
    const start = pan.current;
    const point = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    if (wasPinch || currentView.current.scale > 1) {
      suppressClick.current = true;
      navigation.onPointerCancelCapture();
    } else if (canceled) {
      suppressClick.current = true;
      navigation.onPointerCancelCapture();
    } else {
      navigation.onPointerUpCapture(event);
      if (
        start &&
        point &&
        event.clientY - start.y > 140 &&
        Math.abs(event.clientX - start.x) < 60
      ) {
        suppressClick.current = true;
        onDismiss();
      }
    }
    if (!pointers.current.size) {
      pan.current = null;
      pinch.current = null;
    } else if (wasPinch) {
      // Lifting one finger must not turn the remaining finger into a new pan or tap.
      pan.current = null;
    }
    setDismissOffset(0);
  };
  const button =
    "grid h-11 w-11 shrink-0 place-items-center rounded-full text-white hover:bg-white/20 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-white";

  return (
    <>
      <div
        ref={frame}
        data-photo-navigation
        data-photo-zoom={current.scale}
        className={`relative z-[5] flex h-full min-h-0 w-full max-w-full items-center justify-center overflow-hidden ${current.scale > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
        style={{ touchAction: "none", overscrollBehavior: "contain" }}
        onPointerDownCapture={(event) => {
          if (
            event.button !== 0 ||
            (event.target as Element).closest?.("button")
          )
            return;
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          if (pointers.current.size > 1) {
            suppressClick.current = true;
            pinch.current = { distance: distance(), view: currentView.current };
            navigation.onPointerCancelCapture();
          } else {
            suppressClick.current = false;
            pan.current = {
              x: event.clientX,
              y: event.clientY,
              view: currentView.current,
            };
            navigation.onPointerDownCapture(event);
          }
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMoveCapture={(event) => {
          if (!pointers.current.has(event.pointerId)) return;
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          const start = pan.current;
          if (pinch.current && pointers.current.size > 1 && ready) {
            const initial = pinch.current;
            if (initial.distance > 0) {
              const scale = Math.min(
                4,
                Math.max(
                  1,
                  (initial.view.scale * distance()) / initial.distance,
                ),
              );
              update(scale === 1 ? fit(src) : { ...initial.view, scale });
            }
          } else if (start && currentView.current.scale > 1) {
            suppressClick.current = true;
            update({
              ...currentView.current,
              x: start.view.x + event.clientX - start.x,
              y: start.view.y + event.clientY - start.y,
            });
          } else if (start && !pinch.current) {
            navigation.onPointerMoveCapture(event);
            const dy = event.clientY - start.y;
            if (dy > 20 && Math.abs(event.clientX - start.x) < 60)
              setDismissOffset(dy);
          }
        }}
        onPointerUpCapture={(event) => finish(event)}
        onPointerCancelCapture={(event) => finish(event, true)}
        onLostPointerCapture={(event) => {
          if (pointers.current.has(event.pointerId)) finish(event, true);
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (suppressClick.current || currentView.current.scale > 1) {
            event.preventDefault();
            suppressClick.current = false;
            return;
          }
          navigation.onClick(event);
        }}
      >
        {!ready && failed !== src && (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-white/75"
          >
            Loading photo…
          </div>
        )}
        {failed === src ? (
          <div
            role="status"
            className="space-y-3 text-center text-sm text-white"
          >
            <p>This photo could not load.</p>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-white/30 px-4"
              onClick={() => {
                setLoaded(null);
                setFailed(null);
              }}
            >
              Retry photo
            </button>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={image}
            key={src}
            src={src}
            alt={alt}
            className={`block h-auto max-h-full w-auto max-w-full select-none object-contain ${ready ? "opacity-100" : "opacity-0"}`}
            style={{
              transform: `translate(${current.x}px, ${current.y + dismissOffset}px) scale(${current.scale})`,
            }}
            draggable={false}
            onLoad={() => {
              setLoaded(src);
              onPhotoLoad?.();
            }}
            onError={() => {
              setFailed(src);
              update(fit(src));
            }}
          />
        )}
      </div>
      <div
        role="group"
        aria-label="Photo zoom"
        className="absolute left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-10 flex -translate-x-1/2 items-center rounded-full bg-black/75 text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Zoom out"
          className={button}
          disabled={!ready || current.scale <= 1}
          onClick={() => zoom(current.scale - 0.5)}
        >
          <Minus size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Reset photo zoom"
          title="Fit photo (0)"
          className="h-11 min-w-14 rounded-full px-1 text-xs tabular-nums focus-visible:outline-2 focus-visible:outline-white"
          disabled={!ready}
          onClick={() => zoom(1)}
        >
          {Math.round(current.scale * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          className={button}
          disabled={!ready || current.scale >= 4}
          onClick={() => zoom(current.scale + 0.5)}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <span role="status" className="sr-only">
        {Math.round(current.scale * 100)}% zoom.{" "}
        {current.scale > 1
          ? "Drag or use arrow keys to pan. Press 0 to fit."
          : "Use plus and minus to zoom. Swipe down to close."}
      </span>
      <p className="pointer-events-none absolute left-1/2 top-[max(4rem,env(safe-area-inset-top))] z-10 -translate-x-1/2 whitespace-nowrap text-xs text-white/75">
        {current.scale > 1
          ? "Drag to inspect · tap % to fit"
          : multiple
            ? "Tap left / right · pinch or + to zoom"
            : "Pinch or + to zoom"}
      </p>
    </>
  );
}
