import React, { act, Component, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let DashboardLoading: typeof import("./(dashboard)/loading").default;
let BrandStartupLoader: typeof import("@/components/brand/BrandStartupLoader").BrandStartupLoader;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const sessionKey = "dealerhunt:dashboard-route-startup:v1";
const status = () => host.querySelector<HTMLElement>('[role="status"]')!;
const artwork = () =>
  status().querySelector<HTMLSpanElement>('span[aria-hidden="true"]')!;
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const render = (node: ReactNode = <DashboardLoading />) =>
  act(() => root.render(node));

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  // A new module represents a new JS document for the fallback-storage tests.
  vi.resetModules();
  ({ default: DashboardLoading } = await import("./(dashboard)/loading"));
  ({ BrandStartupLoader } =
    await import("@/components/brand/BrandStartupLoader"));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("shares the visual guard and caps only animation at 1300ms while still pending", () => {
  render();
  expect(status().textContent).toBe("Loading workspace");
  expect(artwork().hidden).toBe(true);
  advance(199);
  expect(artwork().hidden).toBe(true);
  advance(1);
  expect(artwork().hidden).toBe(false);
  expect(artwork().style.width).toBe("32px");
  advance(800);
  expect(artwork().style.width).toBe("64px");
  advance(299);
  expect(status().dataset.motion).toBe("animated");
  advance(1);
  expect(status().dataset.motion).toBe("static");
  expect(status().dataset.state).toBe("loading");
  expect(status().textContent).toBe("Loading workspace");
  expect(host.querySelector('[data-state="complete"]')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  advance(10_000);
  expect(status().dataset.motion).toBe("static");
});

it("exits Suspense immediately for fast usable content and skips repeat mounts", async () => {
  let ready = false;
  let resolve!: () => void;
  const pending = new Promise<void>((done) => {
    resolve = done;
  });
  function Content() {
    if (!ready) throw pending;
    return <button>Usable workspace</button>;
  }
  render(
    <Suspense fallback={<DashboardLoading />}>
      <Content />
    </Suspense>,
  );
  advance(100);
  expect(artwork().hidden).toBe(true);
  await act(async () => {
    ready = true;
    resolve();
    await pending;
  });
  expect(host.querySelector('[role="status"]')).toBeNull();
  expect(host.querySelector("button")?.textContent).toBe("Usable workspace");
  expect(vi.getTimerCount()).toBe(0);
  render(<DashboardLoading />);
  expect(status().dataset.motion).toBe("static");
  advance(200);
  expect(artwork().hidden).toBe(false);
  expect(status().dataset.motion).toBe("static");
});

it("uses an existing session guard across document/module lifetimes without writing again", () => {
  sessionStorage.setItem(sessionKey, "1");
  const write = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("Read-only storage");
    });
  render();
  advance(200);
  expect(status().dataset.motion).toBe("static");
  expect(write).not.toHaveBeenCalled();
});

it.each(["getItem", "setItem"] as const)(
  "falls back to a module guard when storage %s fails",
  (method) => {
    const storage = vi
      .spyOn(Storage.prototype, method)
      .mockImplementation(() => {
        throw new Error("Storage blocked");
      });
    render();
    advance(200);
    expect(status().dataset.motion).toBe("animated");
    render(null);
    expect(vi.getTimerCount()).toBe(0);
    render();
    advance(200);
    expect(status().dataset.motion).toBe("static");
    expect(storage).toHaveBeenCalledTimes(1);
  },
);

it("handles a blocked sessionStorage getter and keeps later fallbacks static", () => {
  vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
    throw new Error("Storage inaccessible");
  });
  render();
  expect(status().dataset.motion).toBe("animated");
  render(null);
  render();
  advance(200);
  expect(status().dataset.motion).toBe("static");
});

it("honors explicit static app motion", () => {
  render(<BrandStartupLoader motion="static" />);
  advance(200);
  expect(artwork().hidden).toBe(false);
  expect(status().dataset.motion).toBe("static");
  advance(1300);
  expect(status().textContent).toBe("Loading workspace");
});

it("server-renders neutral guarded feedback without touching browser session storage", () => {
  const read = vi.spyOn(Storage.prototype, "getItem");
  const html = renderToString(<DashboardLoading />);
  expect(html).toContain("Loading workspace");
  expect(html).toContain('data-motion="static"');
  expect(html).toContain("hidden");
  expect(read).not.toHaveBeenCalled();
});

it("keeps the first-session claim and original cap through Strict Mode effect replay", () => {
  const write = vi.spyOn(Storage.prototype, "setItem");
  render(
    <React.StrictMode>
      <DashboardLoading />
    </React.StrictMode>,
  );
  advance(1299);
  expect(status().dataset.motion).toBe("animated");
  advance(1);
  expect(status().dataset.motion).toBe("static");
  expect(write).toHaveBeenCalledTimes(1);
});

it("unmounts and clears timers immediately when a suspended route becomes an error route", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const failure = new Error("Route failed");
  const expectedError = (event: ErrorEvent) => {
    if (event.error === failure) event.preventDefault();
  };
  window.addEventListener("error", expectedError);
  class RouteErrorBoundary extends Component<
    { children: ReactNode },
    { error: boolean }
  > {
    state = { error: false };
    static getDerivedStateFromError() {
      return { error: true };
    }
    render() {
      return this.state.error ? (
        <p role="alert">Workspace unavailable</p>
      ) : (
        this.props.children
      );
    }
  }
  let failed = false;
  let resolve!: () => void;
  const pending = new Promise<void>((done) => {
    resolve = done;
  });
  function Route(): never {
    if (failed) throw failure;
    throw pending;
  }
  try {
    render(
      <RouteErrorBoundary>
        <Suspense fallback={<DashboardLoading />}>
          <Route />
        </Suspense>
      </RouteErrorBoundary>,
    );
    advance(300);
    expect(status().dataset.motion).toBe("animated");
    await act(async () => {
      failed = true;
      resolve();
      await pending;
    });
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "Workspace unavailable",
    );
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    window.removeEventListener("error", expectedError);
  }
});
