// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SavedRemovalDialog } from "@/components/saved/SavedRemovalDialog";
let root: Root, host: HTMLDivElement;
const cancel = vi.fn(),
  confirm = vi.fn();
async function render(busy = false, error: string | null = null) {
  await act(async () =>
    root.render(
      <SavedRemovalDialog
        open
        busy={busy}
        error={error}
        vehicleLabel="2022 Chevrolet Silverado"
        onCancel={cancel}
        onConfirm={confirm}
      />,
    ),
  );
}
const button = (label: string) =>
  Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
  ).find((el) => el.textContent === label)!;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  cancel.mockClear();
  confirm.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("names the selected vehicle and lets cancellation leave the record untouched", async () => {
  await render();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "2022 Chevrolet Silverado",
  );
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Device backups and purchase history are kept",
  );
  await act(async () => button("Cancel").click());
  expect(cancel).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
});
it("blocks duplicate confirmation while removal is pending", async () => {
  await render(true);
  expect(button("Removing…").disabled).toBe(true);
  expect(button("Cancel").disabled).toBe(true);
  await act(async () => button("Removing…").click());
  expect(confirm).not.toHaveBeenCalled();
});
it("keeps an uncertain failure visible and permits an explicit retry", async () => {
  await render(
    false,
    "We couldn't confirm this change. Check your watchlist and try again.",
  );
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "couldn't confirm",
  );
  await act(async () => button("Remove from account").click());
  expect(confirm).toHaveBeenCalledOnce();
  expect(cancel).not.toHaveBeenCalled();
});
