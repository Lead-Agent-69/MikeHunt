import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/components/shared/CommandPalette", () => ({
  CommandPalette: () => <div data-testid="commands" />,
}));
vi.mock("next/dynamic", () => ({
  default: () => (props: { initialOpen: boolean }) => (
    <div data-testid="guide" data-open={String(props.initialOpen)} />
  ),
}));
import { DashboardOverlays } from "@/components/layout/DashboardOverlays";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("mounts keyboard commands without an idle chunk while leaving guidance unloaded", async () => {
  await act(async () => root.render(<DashboardOverlays />));
  expect(container.querySelector('[data-testid="commands"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="guide"]')).toBeNull();
});

it("honors an immediate decision-guide request without waiting for an idle timer", async () => {
  await act(async () => root.render(<DashboardOverlays />));
  await act(async () =>
    window.dispatchEvent(new Event("open-mikehunt-copilot")),
  );
  expect(
    container.querySelector('[data-testid="guide"]')?.getAttribute("data-open"),
  ).toBe("true");
});
