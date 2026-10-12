import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SWRConfig, type Cache } from "swr";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useAccountSavedVehicles } from "@/hooks/useAccountSavedVehicles";

let root: Root;
let host: HTMLDivElement;
let control: ReturnType<typeof useAccountSavedVehicles>;
let cache: Cache;
function State({ owner }: { owner: string | null }) {
  control = useAccountSavedVehicles(owner);
  return React.createElement(
    "span",
    null,
    control.has("car") ? "Saved" : "Not saved",
  );
}
async function render(owner: string | null) {
  await act(async () => {
    root.render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => cache } },
        React.createElement(State, { owner }),
      ),
    );
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
  localStorage.clear();
  cache = new Map();
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
const rows = [
  { id: "saved", deal_id: "car", status: "watching", snapshot: {} },
];
const response = (data: unknown = rows) =>
  new Response(JSON.stringify(data), { status: 200 });

describe("account saved status on a fresh device", () => {
  it("hydrates membership without a local snapshot using the slim endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue(response());
    await render("one");
    await vi.waitFor(() => expect(host.textContent).toBe("Saved"));
    expect(fetch).toHaveBeenCalledWith(
      "/api/saved-cars?filter=all&view=checklist",
    );
    expect(localStorage.length).toBe(0);
  });
  it("does not carry membership across an account switch or logout", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response([]));
    await render("one");
    await vi.waitFor(() => expect(host.textContent).toBe("Saved"));
    await render("two");
    expect(host.textContent).toBe("Not saved");
    await render(null);
    expect(host.textContent).toBe("Not saved");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not claim membership when account reads fail", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 503 }));
    await render("one");
    await vi.waitFor(() => expect(control.error).toBeTruthy());
    expect(control.has("car")).toBe(false);
  });
  it("rejects malformed reads instead of guessing saved state", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ success: true }));
    await render("one");
    await vi.waitFor(() => expect(control.error).toBeTruthy());
    expect(control.has("car")).toBe(false);
  });
  it("rejects unconfirmed row identities", async () => {
    vi.mocked(fetch).mockResolvedValue(response([{ deal_id: "car" }]));
    await render("one");
    await vi.waitFor(() => expect(control.error).toBeTruthy());
    expect(control.has("car")).toBe(false);
  });
  it("keeps a confirmed save even if an earlier membership read failed", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 503 }));
    await render("one");
    await vi.waitFor(() => expect(control.error).toBeTruthy());
    await act(async () => {
      await control.confirm("car", "confirmed");
    });
    expect(control.has("car")).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("isolates a delayed response from a previous account", async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch)
      .mockReturnValueOnce(
        new Promise<Response>((done) => {
          resolve = done;
        }),
      )
      .mockResolvedValueOnce(response([]));
    await render("one");
    await render("two");
    await act(async () => {
      resolve(response());
    });
    expect(host.textContent).toBe("Not saved");
  });
});
