import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  loading: false,
  error: undefined as any,
  data: undefined as any,
  keys: [] as string[],
  cards: [] as any[],
  fetcher: undefined as any,
}));
vi.mock("swr", () => ({
  default: (key: string, fetcher: any) => {
    state.keys.push(key);
    state.fetcher = fetcher;
    return key === "/api/dealer-network"
      ? {
          data: {
            dealers: [
              {
                host: "recar.com",
                name: "ReCar",
                state: "MO",
                url: "https://recar.com",
              },
            ],
          },
        }
      : {
          data: state.data,
          error: state.error,
          isLoading: state.loading,
          mutate: vi.fn().mockResolvedValue(undefined),
        };
  },
}));
vi.mock("@/hooks/useDealerWatch", () => ({
  useDealerWatch: () => ({ has: () => true, toggle: vi.fn() }),
}));
vi.mock("@/components/shared/DealCard", () => ({
  DealCard: (props: any) => {
    state.cards.push(props);
    return <div>Shared vehicle card</div>;
  },
  DealCardSkeleton: () => <div>Loading card</div>,
}));
import { DealerStorefrontContent } from "./(dashboard)/dealer-network/[host]/page";

beforeEach(() => {
  state.loading = false;
  state.error = undefined;
  state.keys = [];
  state.cards = [];
  state.data = {
    vehicles: [
      {
        id: "one",
        images: ["https://photos.example/car.jpg"],
        dealVerdict: "NOT_ENOUGH_DATA",
      },
    ],
    total: 154,
    hasMore: true,
    deskAccess: "personal",
  };
});
afterEach(() => vi.unstubAllGlobals());

it("shows total inventory rather than pretending the first page is all cars and uses shared evidence cards", () => {
  const html = renderToStaticMarkup(
    <DealerStorefrontContent host="recar.com" />,
  );
  expect(html).toContain("154 matching listings");
  expect(html).toContain(" of 4");
  expect(html).not.toContain("NOT_ENOUGH_DATA");
  expect(state.keys).toContain(
    "/api/scan?dealer=recar.com&page=0&pageSize=48&sort=newest",
  );
  expect(state.cards[0]).toMatchObject({
    flipDesk: false,
    requirePhoto: true,
    imageUrls: ["https://photos.example/car.jpg"],
  });
});
it("does not confuse loading or failed requests with zero inventory", () => {
  state.loading = true;
  state.data = undefined;
  let html = renderToStaticMarkup(<DealerStorefrontContent host="recar.com" />);
  expect(html).toContain("Checking dealer inventory...");
  expect(html).not.toContain("0 matching listings");
  state.loading = false;
  state.error = new Error("offline");
  html = renderToStaticMarkup(<DealerStorefrontContent host="recar.com" />);
  expect(html).toContain("Try again");
  expect(html).not.toContain("No matching listings on this page");
});
it("requests the next page and supports returning to the previous one", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(<DealerStorefrontContent host="recar.com" />),
    );
    const button = (name: string) =>
      Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === name,
      )!;
    await act(async () => {
      button("Next").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(state.keys.at(-1)).toContain("page=1&pageSize=48");
    await act(async () => {
      button("Previous").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(state.keys.at(-1)).toContain("page=0&pageSize=48");
  } finally {
    await act(async () => root.unmount());
  }
});
it("rejects malformed success payloads and HTTP failures", async () => {
  renderToStaticMarkup(<DealerStorefrontContent host="recar.com" />);
  for (const [status, payload] of [
    [503, {}],
    [200, {}],
    [200, { degraded: true }],
  ] as const) {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(payload), { status })),
    );
    await expect(state.fetcher("/api/scan?dealer=recar.com")).rejects.toThrow(
      "Dealer inventory unavailable",
    );
  }
});
