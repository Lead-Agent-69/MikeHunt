"use client";

import { useEffect, useState } from "react";

/**
 * Registers the PWA service worker (public/sw.js) once on mount.
 * No-op on browsers without service worker support and outside production
 * (avoids stale-cache headaches during local development).
 */
export function PWARegister() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // An old production worker on localhost can intercept fresh dev pages.
      void navigator.serviceWorker
        .getRegistrations()
        .then(async (registrations) => {
          for (const registration of registrations) {
            const script =
              registration.active?.scriptURL || registration.waiting?.scriptURL;
            if (script && new URL(script).pathname === "/sw.js")
              await registration.unregister();
          }
          const names = await caches.keys();
          await Promise.all(
            names
              .filter((name) => name.startsWith("MikeHunt-"))
              .map((name) => caches.delete(name)),
          );
        })
        .catch(() => undefined);
      return;
    }

    const observeRegistration = (registration: ServiceWorkerRegistration) => {
      const observeInstalling = (worker: ServiceWorker | null) => {
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            setUpdateReady(true);
          }
        });
      };
      observeInstalling(registration.installing);
      registration.addEventListener("updatefound", () => {
        observeInstalling(registration.installing);
      });
      registration.update().catch(() => undefined);
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then(observeRegistration)
        .catch(() => {
          // Registration failures are non-fatal — the app still works without offline support.
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-[80] mx-auto flex max-w-md items-center justify-between gap-3 rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-3 text-sm shadow-[var(--shadow)] md:bottom-5"
    >
      <span className="font-semibold text-[var(--t2)]">
        A new version is ready.
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-[var(--r1)] bg-[var(--accent)] px-3 py-1.5 text-xs font-black text-[var(--on-accent)]"
      >
        Refresh
      </button>
    </div>
  );
}
