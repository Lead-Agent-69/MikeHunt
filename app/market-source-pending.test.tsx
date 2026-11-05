import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { SWRConfig, type Cache } from "swr";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({ loading: false }));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({ prefs: {}, isLoading: preferences.loading }),
}));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({ intent: { buyerMode: "personal" } }),
}));
// Keep the page, source controls, debounce, fetcher and SWR inventory hook real.
// Unrelated result visualizations do not participate in this interaction.
vi.mock("@/components/market/USHeatmap", () => ({ USHeatmap: () => null }));
vi.mock("@/components/market/MarketVisualizers", () => ({
  MarketVisualizers: () => null,
}));
vi.mock("@/components/market/MarketResultsMap", () => ({
  MarketResultsMap: () => null,
}));
vi.mock("@/components/market/MarketIntelligence", () => ({
  MarketIntelligence: () => null,
}));
vi.mock("@/components/scan/DealTable", () => ({ DealTable: () => null }));
vi.mock("@/components/shared/Ico", () => ({ Ico: () => null }));
vi.mock("@/components/shared/PriceRangeSelector", () => ({
  PriceRangeSelector: () => null,
  YearRangeSelector: () => null,
}));
vi.mock("@/components/market/MarketListingCard", () => ({
  MarketListingCard: ({ row }: { row: { id: string } }) => (
    <p data-testid="source-test-row">{row.id}</p>
  ),
}));
import MarketPage from "./(dashboard)/market/page";

let host: HTMLDivElement;
let root: Root;
let cache: Cache;
let requests: {
  params: URLSearchParams;
  jsonRead: boolean;
  finish: (id: string) => void;
}[];
const sourceSelect = () =>
  host.querySelector<HTMLSelectElement>(
    '[aria-label="Quick source or dealer"]',
  )!;
const sourceShortcut = () =>
  host.querySelector<HTMLButtonElement>('[aria-label^="Edit source:"]')!;

const render = () =>
  act(async () => {
    root.render(
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        <MarketPage />
      </SWRConfig>,
    );
  });
const settle = async (check: () => void) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    try {
      check();
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  preferences.loading = false;
  requests = [];
  cache = new Map();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(
    null,
    "",
    "/market?scope=explicit&states=MO&sources=copart,iaa&priceMax=25000&hasPhotos=yes&includeRepairable=0&sort=askPrice&sortDir=asc",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const parsed = new URL(url, "http://localhost");
      expect(parsed.pathname).toBe("/api/market/explore");
      return new Promise<Response>((resolve) => {
        const request = {
          params: parsed.searchParams,
          jsonRead: false,
          finish: (id: string) => {
            const response = new Response(
              JSON.stringify({
                configured: true,
                rows: [{ id, images: [] }],
                page: 0,
                pageSize: 50,
                total: 1,
                nextCursor: null,
                mode: "all",
                facets: {},
                sourceCoverage: {
                  counts: { copart: 1, iaa: 1 },
                  complete: true,
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
            const readJSON = response.json.bind(response);
            response.json = async () => {
              const body = await readJSON();
              request.jsonRead = true;
              return body;
            };
            resolve(response);
          },
        };
        requests.push(request);
      });
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("opens and changes Source during a pending first page and ignores the older source response", async () => {
  await render();
  await settle(() => expect(requests).toHaveLength(1));
  expect(requests[0].params.get("sources")).toBe("copart,iaa");
  expect(host.textContent).toContain("Searching");
  expect(sourceShortcut().disabled).toBe(false);
  expect(sourceSelect().disabled).toBe(false);
  expect(sourceSelect().textContent).toContain("Updating matches");

  act(() => sourceShortcut().click());
  expect(sourceShortcut().getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(sourceSelect());
  act(() =>
    Simulate.change(sourceSelect(), { target: { value: "iaa" } } as any),
  );
  expect(sourceSelect().value).toBe("iaa");
  expect(sourceSelect().disabled).toBe(false);
  expect(new URLSearchParams(window.location.search).get("sources")).toBe(
    "iaa",
  );

  await settle(() => expect(requests).toHaveLength(2));
  const latest = requests[1];
  for (const [key, value] of Object.entries({
    sources: "iaa",
    states: "MO",
    priceMax: "25000",
    hasPhotos: "yes",
    includeRepairable: "0",
    sort: "askPrice",
    sortDir: "asc",
    page: "0",
    pageSize: "50",
  }))
    expect(latest.params.get(key)).toBe(value);

  await act(async () => latest.finish("LATEST-IAA"));
  await settle(() => expect(host.textContent).toContain("LATEST-IAA"));
  // Resolve, rather than abort, the original first page after the new one.
  await act(async () => requests[0].finish("OLDER-COPART"));
  await settle(() => expect(requests[0].jsonRead).toBe(true));
  expect(host.textContent).not.toContain("OLDER-COPART");
  expect(host.querySelectorAll('[data-testid="source-test-row"]')).toHaveLength(
    1,
  );
  expect(sourceSelect().value).toBe("iaa");
  expect(new URLSearchParams(window.location.search).get("sources")).toBe(
    "iaa",
  );
  expect(requests).toHaveLength(2);
});

it("retains the readiness guard until preferences finish loading", async () => {
  preferences.loading = true;
  await render();
  expect(sourceShortcut().disabled).toBe(true);
  expect(sourceSelect().disabled).toBe(true);
  expect(requests).toHaveLength(0);
  preferences.loading = false;
  await render();
  await settle(() => expect(requests).toHaveLength(1));
  expect(sourceShortcut().disabled).toBe(false);
  expect(sourceSelect().disabled).toBe(false);
});
