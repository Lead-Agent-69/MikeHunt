import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  desk: "personal",
  owner: "owner-a" as string | null,
  loading: false,
  query: "scope=explicit&states=MO%2CFL&hasPhotos=yes&seenWithin=7",
}));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({
    dealerId: state.owner,
    loading: state.loading,
    error: null,
  }),
}));
vi.mock("@/hooks/useInventoryViewScope", () => ({
  useInventoryViewScope: () => ({ query: state.query, ready: true }),
}));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({
    prefs: { buyerScope: { buyerMode: state.desk } },
    isLoading: false,
  }),
}));
vi.mock("@/components/discovery/DiscoverySaveProvider", () => ({
  DiscoverySaveProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useDiscoverySave: () => ({
    saved: false,
    busy: false,
    label: "Save",
    toggle: vi.fn(),
  }),
}));
vi.mock("next/link", () => ({
  default: ({ children, prefetch: _prefetch, ...props }: any) => (
    <a {...props}>{children}</a>
  ),
}));
import FeedPage from "./(dashboard)/feed/page";

let root: Root, host: HTMLDivElement;
const fetchMock = vi.fn();
const scrollTo = vi.fn();
let observer: IntersectionObserverCallback;
const response = (id: string, nextOffset: number | null = 12) => ({
  ok: true,
  json: async () => ({
    items: [
      {
        id,
        title: `Car ${id}`,
        source: "cars_com",
        image: `https://photos.example/${id}.jpg`,
      },
    ],
    nextOffset,
  }),
});
const render = async () => {
  await act(async () => root.render(<FeedPage />));
};
const click = async (label: string) => {
  const button = Array.from(host.querySelectorAll("button")).find(
    (element) =>
      element.textContent === label ||
      element.getAttribute("aria-label") === label,
  )!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
};
const leave = async () => {
  await act(async () => root.render(null));
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        observer = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue(response("one"));
  scrollTo.mockClear();
  Object.defineProperty(document.documentElement, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });
  state.owner = "owner-a";
  state.desk = "personal";
  state.loading = false;
  state.query = "scope=explicit&states=MO%2CFL&hasPhotos=yes&seenWithin=7";
  sessionStorage.clear();
  window.history.replaceState(
    { router: "retained" },
    "",
    `/feed?${state.query}`,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  sessionStorage.clear();
  delete (document.documentElement as Partial<HTMLElement>).scrollTo;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("returns from detail with third-batch depth, anchor, filters and the next cursor", async () => {
  await render();
  fetchMock.mockResolvedValueOnce(response("two", 24));
  await click("Load more cars");
  fetchMock.mockResolvedValueOnce(response("three", 36));
  await click("Load more cars");
  const card = host.querySelector<HTMLElement>('[data-feed-vehicle="three"]')!;
  vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
    top: 180,
    bottom: 780,
  } as DOMRect);
  const detail = card.querySelector<HTMLAnchorElement>(
    'a[href="/deal/three"]',
  )!;
  detail.addEventListener("click", (event) => event.preventDefault());
  await act(async () => detail.click());
  await leave();
  expect(
    JSON.parse(sessionStorage.getItem("mh-feed-return-v1")!),
  ).toMatchObject({ offset: 36, anchor: { id: "three", top: 180 } });
  window.history.replaceState(window.history.state, "", "/deal/three");
  window.history.replaceState(window.history.state, "", `/feed?${state.query}`);
  await render();
  const returned = host.querySelector<HTMLElement>(
    '[data-feed-vehicle="three"]',
  )!;
  vi.spyOn(returned, "getBoundingClientRect").mockReturnValue({
    top: 1380,
    bottom: 1980,
  } as DOMRect);
  await act(async () => vi.advanceTimersByTime(16));
  expect(scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: "instant" });
  vi.spyOn(returned, "getBoundingClientRect").mockReturnValue({
    top: 180,
    bottom: 780,
  } as DOMRect);
  await act(async () => vi.advanceTimersByTime(48));
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(host.querySelectorAll('[data-testid="feed-vehicle"]')).toHaveLength(3);
  expect(window.history.state).toEqual({ router: "retained" });
  fetchMock.mockResolvedValueOnce(response("four", null));
  await click("Load more cars");
  const request = new URL(fetchMock.mock.calls.at(-1)![0], "http://localhost");
  expect(request.searchParams.get("offset")).toBe("36");
  expect(request.searchParams.get("states")).toBe("MO,FL");
  expect(request.searchParams.get("hasPhotos")).toBe("yes");
  expect(request.searchParams.get("seenWithin")).toBe("7");
});

it("retains current vehicles on a failed refresh and retries offset zero after returning", async () => {
  await render();
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  await click("Refresh feed");
  expect(host.textContent).toContain("Car one");
  expect(host.textContent).toContain("Try again");
  await leave();
  await render();
  await act(async () =>
    observer(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockResolvedValueOnce(response("fresh", null));
  await click("Try again");
  expect(fetchMock.mock.calls.at(-1)![0]).toContain("offset=0");
  expect(host.textContent).toContain("Car fresh");
  expect(host.textContent).not.toContain("Car one");
});

it("allows only one continuation in flight and keeps the cursor after a failed continuation", async () => {
  await render();
  let reject!: (reason: Error) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  await act(async () => {
    observer(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    observer(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => reject(new Error("offline")));
  expect(host.textContent).toContain("Car one");
  fetchMock.mockResolvedValueOnce(response("two", null));
  await click("Try again");
  expect(fetchMock.mock.calls.at(-1)![0]).toContain("offset=12");
  expect(host.textContent).toContain("Car one");
  expect(host.textContent).toContain("Car two");
});

it.each(["owner", "desk", "query", "url", "expired", "malformed"])(
  "ignores a return snapshot for %s",
  async (change) => {
    await render();
    await leave();
    if (change === "owner") state.owner = "owner-b";
    if (change === "desk") state.desk = "dealer";
    if (change === "query") state.query = "scope=explicit&states=TX";
    if (change === "url")
      window.history.replaceState({}, "", "/feed?states=TX");
    if (change === "expired") vi.setSystemTime(Date.now() + 31 * 60 * 1000);
    if (change === "malformed")
      sessionStorage.setItem("mh-feed-return-v1", "{bad");
    fetchMock.mockResolvedValueOnce(response("new", null));
    await render();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain("Car one");
    expect(host.textContent).toContain("Car new");
  },
);

it("clears a previous owner's rendered vehicles while account identity loads", async () => {
  await render();
  state.loading = true;
  await render();
  expect(host.textContent).not.toContain("Car one");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  state.loading = false;
  state.owner = "owner-b";
  fetchMock.mockResolvedValueOnce(response("other", null));
  await render();
  expect(host.textContent).toContain("Car other");
});

it("keeps browsing usable when session storage is disabled", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("disabled");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("disabled");
  });
  await render();
  await leave();
  await render();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("Car one");
});

it("does not restore an unfinished first request during Strict Mode effect replay", async () => {
  await act(async () =>
    root.render(
      <React.StrictMode>
        <FeedPage />
      </React.StrictMode>,
    ),
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  expect(host.textContent).toContain("Car one");
});

it("restores the dashboard body scroller and stops when the user intervenes", async () => {
  await render();
  const card = host.querySelector<HTMLElement>("[data-feed-vehicle]")!;
  vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
    top: 150,
    bottom: 750,
  } as DOMRect);
  await leave();
  document.body.style.overflowY = "auto";
  const bodyScroll = vi.fn();
  Object.defineProperty(document.body, "scrollTo", {
    configurable: true,
    value: bodyScroll,
  });
  try {
    await render();
    const returned = host.querySelector<HTMLElement>("[data-feed-vehicle]")!;
    vi.spyOn(returned, "getBoundingClientRect").mockReturnValue({
      top: 950,
      bottom: 1550,
    } as DOMRect);
    await act(async () => vi.advanceTimersByTime(16));
    expect(bodyScroll).toHaveBeenCalledWith({ top: 800, behavior: "instant" });
    expect(scrollTo).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new Event("wheel")));
    await act(async () => vi.advanceTimersByTime(100));
    expect(bodyScroll).toHaveBeenCalledTimes(1);
  } finally {
    document.body.style.overflowY = "";
    delete (document.body as Partial<HTMLElement>).scrollTo;
  }
});
