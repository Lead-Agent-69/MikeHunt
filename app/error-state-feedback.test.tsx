import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBanner, ErrorState } from "@/components/shared/ErrorState";
let cleanup: (() => void) | undefined;
function render(children: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(children));
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}
afterEach(() => cleanup?.());
describe("error feedback controls", () => {
  it("announces an inline error and dismisses it without submitting its surrounding form", () => {
    const dismiss = vi.fn(),
      submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const host = render(
      <form onSubmit={submit}>
        <ErrorBanner
          message="Check your connection and try again."
          onDismiss={dismiss}
        />
      </form>,
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Check your connection",
    );
    const button = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss message"]',
    )!;
    act(() => button.click());
    expect(dismiss).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });
  it("keeps retry as an explicit action", () => {
    const retry = vi.fn();
    const host = render(
      <ErrorState message="Check your connection." onRetry={retry} />,
    );
    expect(retry).not.toHaveBeenCalled();
    act(() => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(retry).toHaveBeenCalledOnce();
    expect(host.querySelector("button")?.type).toBe("button");
  });
});
