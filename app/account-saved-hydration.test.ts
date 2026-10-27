import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import useSWR, { SWRConfig, type Cache } from "swr";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useAccountSavedVehicles } from "@/hooks/useAccountSavedVehicles";

let root: Root;
let host: HTMLDivElement;
let control: ReturnType<typeof useAccountSavedVehicles>;
let cache: Cache;
function State({ owner }: { owner: string | null }) {
  control = useAccountSavedVehicles(owner, "car");
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
const membership = { ownerId: "one", dealId: "car", savedId: "saved" };
const response = (data: unknown = membership) =>
  new Response(JSON.stringify(data), { status: 200 });

describe("account saved status on a fresh device", () => {
  it("refreshes the owner's card collection after detail confirmation without refreshing another owner", async () => {
    let created = false;
    vi.mocked(fetch).mockImplementation(async (url) => {
      const target = String(url);
      if (target.includes("view=membership"))
        return response({ ownerId: "one", dealId: "car", savedId: null });
      return response(
        created
          ? [
              {
                id: "confirmed",
                deal_id: "car",
                user_id: target.includes("dealerId=two") ? "two" : "one",
              },
            ]
          : [],
      );
    });
    function Collection({ owner }: { owner: string }) {
      const key = `/api/saved-cars?filter=all&dealerId=${owner}`;
      const { data } = useSWR(key, async () => {
        const r = await fetch(key);
        return r.json();
      });
      return React.createElement(
        "p",
        { id: owner },
        String(data?.length ?? "loading"),
      );
    }
    await act(async () =>
      root.render(
        React.createElement(
          SWRConfig,
          { value: { provider: () => cache } },
          React.createElement(State, { owner: "one" }),
          React.createElement(Collection, { owner: "one" }),
          React.createElement(Collection, { owner: "two" }),
        ),
      ),
    );
    await vi.waitFor(() =>
      expect(host.querySelector("#one")?.textContent).toBe("0"),
    );
    await vi.waitFor(() =>
      expect(host.querySelector("#two")?.textContent).toBe("0"),
    );
    created = true;
    await act(async () => {
      await control.confirm("car", "confirmed");
    });
    await vi.waitFor(() =>
      expect(host.querySelector("#one")?.textContent).toBe("1"),
    );
    expect(host.querySelector("#two")?.textContent).toBe("0");
    expect(control.has("car")).toBe(true);
  });

  it("hydrates exact membership without loading a collection or local snapshot", async () => {
    vi.mocked(fetch).mockResolvedValue(response());
    await render("one");
    await vi.waitFor(() => expect(host.textContent).toBe("Saved"));
    expect(fetch).toHaveBeenCalledWith(
      "/api/saved-cars?view=membership&dealId=car",
      expect.objectContaining({ headers: { "X-Save-Owner": "one" } }),
    );
    expect(localStorage.length).toBe(0);
  });
  it("does not carry membership across an account switch or logout", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(
        response({ ownerId: "two", dealId: "car", savedId: null }),
      );
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
      .mockResolvedValueOnce(
        response({ ownerId: "two", dealId: "car", savedId: null }),
      );
    await render("one");
    await render("two");
    await act(async () => {
      resolve(response());
    });
    expect(host.textContent).toBe("Not saved");
  });
  it("rejects another account's successful response under the old cache key", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ ...membership, ownerId: "two" }),
    );
    await render("one");
    await vi.waitFor(() => expect(control.error).toBeTruthy());
    expect(control.has("car")).toBe(false);
  });
  it("rejects an empty response from a different account", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ ownerId: "two", dealId: "car", savedId: null }),
    );
    await render("one");
    await vi.waitFor(() => expect(control.error).toBeTruthy());
  });
  it("rejects a receipt for a different vehicle", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ ...membership, dealId: "other" }),
    );
    await render("one");
    await vi.waitFor(() => expect(control.error).toBeTruthy());
    expect(control.has("car")).toBe(false);
  });
  it("does not confirm a different vehicle into this vehicle's cache", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ ...membership, savedId: null }),
    );
    await render("one");
    await vi.waitFor(() => expect(control.isLoading).toBe(false));
    await act(async () => {
      await control.confirm("other", "confirmed");
    });
    expect(control.has("car")).toBe(false);
  });
});
