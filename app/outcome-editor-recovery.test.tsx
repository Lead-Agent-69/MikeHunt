import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutcomeEditor } from "@/components/outcomes/OutcomeEditor";
import { completeSale } from "@/lib/outcomes/ledger.fixture";
import { validateOutcome } from "@/lib/outcomes/ledger";
const record = {
  ...completeSale({ notes: "receipt A" }),
  id: "a0110000-0000-4000-8000-000000000001",
  user_id: "owner",
  revision: 1,
};
let host: HTMLDivElement, root: Root;
const onSaved = vi.fn(),
  onReload = vi.fn(),
  request = vi.fn();
const button = (text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  )!;
async function click(text: string) {
  await act(async () => button(text).click());
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", request);
  request.mockReset();
  onSaved.mockReset();
  onReload.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <OutcomeEditor
        ownerId="owner"
        record={record}
        onSaved={onSaved}
        onCancel={() => undefined}
        onReload={onReload}
      />,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe("outcome editor recovery", () => {
  it("retains the draft when a successful-looking acknowledgement has different dates", async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        outcome: { ...record, revision: 2, sold_at: "2026-10-02" },
      }),
    });
    await click("Save actual outcome");
    expect(onSaved).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Save was not confirmed",
    );
    expect(
      host.querySelector<HTMLInputElement>('[data-outcome-field="sold_at"]')
        ?.value,
    ).toBe("2026-10-01");
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        outcome: { ...record, ...validateOutcome(record).row, revision: 2 },
      }),
    });
    await click("Save actual outcome");
    expect(onSaved).toHaveBeenCalledOnce();
    expect(JSON.parse(request.mock.calls[0][1].body).id).toBe(
      JSON.parse(request.mock.calls[1][1].body).id,
    );
  });
  it("keeps a conflicted draft visible and catches reload failure", async () => {
    request.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Record changed" }),
    });
    await click("Save actual outcome");
    onReload.mockRejectedValue(new Error("offline"));
    await click("Reload saved version");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Your draft is still here",
    );
    expect(
      host.querySelector<HTMLInputElement>('[data-outcome-field="notes"]')
        ?.value,
    ).toBe("receipt A");
    expect(button("Save actual outcome").disabled).toBe(true);
    await click("Reload saved version");
    expect(onReload).toHaveBeenCalledTimes(2);
    expect(onReload).toHaveBeenCalledWith(record.id);
  });
  it("does not deliver a late save callback after its account editor unmounts", async () => {
    let resolve!: (value: unknown) => void;
    request.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await click("Save actual outcome");
    await act(async () => root.render(<p>Another account</p>));
    await act(async () =>
      resolve({
        ok: true,
        json: async () => ({
          success: true,
          outcome: { ...record, ...validateOutcome(record).row, revision: 2 },
        }),
      }),
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(host.textContent).toBe("Another account");
  });
});
