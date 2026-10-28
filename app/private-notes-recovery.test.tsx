import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { DealNotes } from "@/components/deal/DealNotes";
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import { toast } from "sonner";
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
const response = (note: string, status = 200) =>
  new Response(JSON.stringify({ note }), { status });
const render = async (id = "one") =>
  act(async () =>
    root.render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <DealNotes dealId={id} />
      </SWRConfig>,
    ),
  );
const edit = async (text: string) =>
  act(async () => {
    const input = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const clickSave = async () =>
  act(async () => {
    Array.from(host.querySelectorAll("button"))
      .find((x) => x.textContent === "Save note")!
      .click();
  });
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(toast.success).mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("blocks editing after a load failure and provides real retry", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 503 }))
    .mockResolvedValue(response("existing private note"));
  vi.stubGlobal("fetch", fetch);
  await render();
  expect(host.querySelector("textarea")!.disabled).toBe(true);
  expect(host.textContent).toContain("could not be loaded");
  await act(async () => {
    host.querySelector("button")!.click();
  });
  expect(host.querySelector("textarea")!.value).toBe("existing private note");
  expect(host.querySelector("textarea")!.disabled).toBe(false);
});
it("keeps newer typing when an earlier submitted draft is confirmed", async () => {
  let finish!: (r: Response) => void;
  const pending = new Promise<Response>((r) => (finish = r));
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response("original"))
    .mockReturnValueOnce(pending);
  vi.stubGlobal("fetch", fetch);
  await render();
  await edit("submitted");
  await clickSave();
  await edit("newer unsaved draft");
  await act(async () => finish(response("submitted")));
  expect(host.querySelector("textarea")!.value).toBe("newer unsaved draft");
  expect(host.textContent).toContain("Unsaved changes");
  expect(toast.success).toHaveBeenCalledTimes(1);
});
it("keeps a failed draft and never claims successful save", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(response("original"))
      .mockResolvedValueOnce(new Response("{}", { status: 503 })),
  );
  await render();
  await edit("keep my draft");
  await clickSave();
  expect(host.querySelector("textarea")!.value).toBe("keep my draft");
  expect(host.textContent).toContain("not confirmed");
  expect(toast.success).not.toHaveBeenCalled();
});
it("rejects an HTTP-success response that does not confirm submitted text", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(response("original"))
      .mockResolvedValueOnce(response("different")),
  );
  await render();
  await edit("draft");
  await clickSave();
  expect(host.querySelector("textarea")!.value).toBe("draft");
  expect(toast.success).not.toHaveBeenCalled();
});
it("does not autosave on blur or overlap repeated save clicks", async () => {
  let finish!: (r: Response) => void;
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response("original"))
    .mockReturnValueOnce(new Promise<Response>((r) => (finish = r)));
  vi.stubGlobal("fetch", fetch);
  await render();
  await edit("draft");
  await act(async () =>
    host
      .querySelector("textarea")!
      .dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  await clickSave();
  await act(async () => host.querySelector("button")!.click());
  expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => finish(response("draft")));
  expect(host.textContent).not.toContain("Unsaved changes");
});
it("aborts a leaving editor and prevents late success from altering the next listing", async () => {
  let finish!: (r: Response) => void;
  let writeSignal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        writeSignal = init.signal as AbortSignal;
        return new Promise<Response>((r) => (finish = r));
      }
      return Promise.resolve(
        response(_url.includes("/two/") ? "second car note" : "original"),
      );
    }),
  );
  await render();
  await edit("first car draft");
  await clickSave();
  await render("two");
  expect(writeSignal?.aborted).toBe(true);
  await act(async () => finish(response("first car draft")));
  expect(host.querySelector("textarea")!.value).toBe("second car note");
  expect(toast.success).not.toHaveBeenCalled();
});
