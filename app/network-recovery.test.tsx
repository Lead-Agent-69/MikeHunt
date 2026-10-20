import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkProvider, useNetwork } from "@/components/ui/mobile-ux";
let host: HTMLDivElement, root: Root;
const request = vi.fn();
function Probe() {
  const { isOnline } = useNetwork();
  return <p>{isOnline ? "reachable" : "unreachable"}</p>;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", request);
  request.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () =>
    root.render(
      <NetworkProvider>
        <Probe />
      </NetworkProvider>,
    ),
  );
}
describe("connection status recovery", () => {
  it("recovers from a transient request failure without needing a browser online event", async () => {
    request
      .mockRejectedValueOnce(new Error("temporary timeout"))
      .mockResolvedValue({ ok: true });
    await render();
    expect(host.textContent).toBe("unreachable");
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(host.textContent).toBe("reachable");
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("ignores an older failed probe after a newer connection check succeeds", async () => {
    let reject!: (error: Error) => void;
    request
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          }),
      )
      .mockResolvedValue({ ok: true });
    await render();
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await act(async () => reject(new Error("old request aborted")));
    expect(host.textContent).toBe("reachable");
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("stops scheduled probes after unmount", async () => {
    request.mockRejectedValue(new Error("offline"));
    await render();
    await act(async () => root.render(<p>closed</p>));
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(request).toHaveBeenCalledOnce();
  });
});
