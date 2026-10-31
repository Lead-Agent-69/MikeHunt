import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useScopedSourceHealth } from "@/hooks/useScopedSourceHealth";
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let view: ReturnType<
  typeof useScopedSourceHealth<{ scopeStatus: { label: string } }>
>;
function Harness({
  url,
  enabled = true,
}: {
  url: string | null;
  enabled?: boolean;
}) {
  view = useScopedSourceHealth(url, enabled);
  return (
    <span>
      {view.data?.scopeStatus.label || "no current status"}
      {view.isLoading ? " loading" : ""}
    </span>
  );
}
const render = async (url: string | null, enabled = true) =>
  act(async () => root.render(<Harness url={url} enabled={enabled} />));
const tick = async () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
const result = (label: string) =>
  new Response(JSON.stringify({ scopeStatus: { label } }));
beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("debounces rapid search criteria and fetches only the latest scope", async () => {
  const fetch = vi.fn().mockResolvedValue(result("latest"));
  vi.stubGlobal("fetch", fetch);
  await render("/api/scrape/health?q=f");
  await render("/api/scrape/health?q=fo");
  await render("/api/scrape/health?q=ford");
  expect(fetch).not.toHaveBeenCalled();
  await tick();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("/api/scrape/health?q=ford");
  expect(host.textContent).toBe("latest");
});
it("aborts obsolete requests and refuses their late responses", async () => {
  let finish!: (value: Response) => void;
  const fetch = vi
    .fn()
    .mockReturnValueOnce(new Promise<Response>((r) => (finish = r)))
    .mockResolvedValue(result("Missouri"));
  vi.stubGlobal("fetch", fetch);
  await render("/api/scrape/health?state=FL");
  await tick();
  const signal = fetch.mock.calls[0][1].signal as AbortSignal;
  await render("/api/scrape/health?state=MO");
  expect(signal.aborted).toBe(true);
  await tick();
  await act(async () => finish(result("old Florida")));
  expect(host.textContent).toBe("Missouri");
});
it("does not show earlier successful health under a newly edited scope", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(result("old scope")));
  await render("/api/scrape/health?q=old");
  await tick();
  expect(host.textContent).toBe("old scope");
  await render("/api/scrape/health?q=new");
  expect(host.textContent).not.toContain("old scope");
});
it("prevents a stale manual-refresh closure from aborting the current scope", async () => {
  const fetch = vi.fn().mockResolvedValue(result("current"));
  vi.stubGlobal("fetch", fetch);
  await render("/api/scrape/health?q=old");
  const old = view!.refresh;
  await render("/api/scrape/health?q=current");
  await act(async () => {
    expect(await old({ silent: true })).toBe(null);
  });
  await tick();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(host.textContent).toBe("current");
});
it("does not fetch when disabled and cancels when leaving", async () => {
  const fetch = vi.fn().mockImplementation(
    (_url: string, init: RequestInit) =>
      new Promise(() => {
        expect(init.signal).toBeTruthy();
      }),
  );
  vi.stubGlobal("fetch", fetch);
  await render("/api/scrape/health", false);
  await tick();
  expect(fetch).not.toHaveBeenCalled();
  await render("/api/scrape/health");
  await tick();
  const signal = fetch.mock.calls[0][1].signal as AbortSignal;
  await act(async () => root.render(<div />));
  expect(signal.aborted).toBe(true);
});
it("never presents failed metadata as a successful healthy result", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
  );
  await render("/api/scrape/health");
  await tick();
  expect(view!.data).toBe(null);
  expect(view!.isLoading).toBe(false);
});
it("times out without leaving the status permanently loading", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal!.addEventListener("abort", () =>
              reject(new Error("aborted")),
            ),
          ),
      ),
  );
  await render("/api/scrape/health");
  await tick();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(view!.data).toBe(null);
  expect(view!.isLoading).toBe(false);
});
it("refreshes immediately after a real task instead of waiting for the typing debounce", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(result("first check"))
    .mockResolvedValueOnce(result("after real task"));
  vi.stubGlobal("fetch", fetch);
  await render("/api/scrape/health?q=ford");
  await tick();
  await act(async () => {
    await view!.refresh({ silent: true });
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(host.textContent).toBe("after real task");
});
it("an absent detail key does not fetch or remain loading", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await render(null);
  await tick();
  expect(view!.isLoading).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => {
    expect(await view!.refresh()).toBeNull();
  });
});
it("manual refresh cancels the pending debounce instead of starting a duplicate request", async () => {
  const fetch = vi.fn().mockImplementation(async () => result("current"));
  vi.stubGlobal("fetch", fetch);
  await render("/api/scrape/health?q=ford");
  await act(async () => {
    await view!.refresh();
  });
  await tick();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("enforces the timeout even when a request implementation ignores abort", async () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  await render("/api/scrape/health");
  await tick();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(view!.isLoading).toBe(false);
  expect(view!.error).toContain("unavailable");
});
it("cleans up pending debounce and timeout resources when leaving", async () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  await render("/api/scrape/health");
  await tick();
  await act(async () => root.render(<div />));
  expect(vi.getTimerCount()).toBe(0);
});
