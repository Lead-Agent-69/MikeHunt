import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Field, PasswordField, SelectField } from "@/components/shared/Field";

describe("shared control readiness", () => {
  it("keeps a password draft intact while showing, hiding and disabling visibility", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      act(() =>
        root.render(
          React.createElement(PasswordField, {
            label: "Password",
            defaultValue: "layout-test-only",
          }),
        ),
      );
      const input = host.querySelector("input")!;
      const button = host.querySelector("button")!;
      act(() => button.click());
      expect(input.type).toBe("text");
      expect(input.value).toBe("layout-test-only");
      expect(button.getAttribute("aria-pressed")).toBe("true");
      act(() => button.click());
      expect(input.type).toBe("password");
      expect(input.value).toBe("layout-test-only");
      act(() =>
        root.render(
          React.createElement(PasswordField, {
            label: "Password",
            disabled: true,
          }),
        ),
      );
      act(() => button.click());
      expect(input.type).toBe("password");
      expect(button.disabled).toBe(true);
    } finally {
      act(() => root.unmount());
    }
  });
  for (const [name, Component, props] of [
    ["text", Field, { label: "Name" }],
    ["password", PasswordField, { label: "Password" }],
    [
      "select",
      SelectField,
      { label: "State", options: [{ value: "MO", label: "Missouri" }] },
    ],
  ] as const) {
    it(`${name} is disabled on the server and honors caller restrictions after hydration`, async () => {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      const element = React.createElement(
        Component as React.ElementType,
        props,
      );
      const host = document.createElement("div");
      host.innerHTML = renderToString(element);
      expect(
        (host.querySelector("input,select") as HTMLInputElement).disabled,
      ).toBe(true);
      const root = createRoot(host);
      try {
        await act(async () => root.render(element));
        expect(
          (host.querySelector("input,select") as HTMLInputElement).disabled,
        ).toBe(false);
        await act(async () =>
          root.render(
            React.createElement(Component as React.ElementType, {
              ...props,
              disabled: true,
            }),
          ),
        );
        expect(
          (host.querySelector("input,select") as HTMLInputElement).disabled,
        ).toBe(true);
        if (name === "password")
          expect(host.querySelector("button")!.disabled).toBe(true);
      } finally {
        await act(async () => root.unmount());
        vi.unstubAllGlobals();
      }
    });
  }

  it("preserves the first controlled edit across rerenders", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    function Form() {
      const [value, setValue] = React.useState("");
      return React.createElement(Field, {
        label: "Name",
        value,
        onChange: (event) => setValue(event.target.value),
      });
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      await act(async () => root.render(React.createElement(Form)));
      const input = host.querySelector("input")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(input, "First entry");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => root.render(React.createElement(Form)));
      expect(input.value).toBe("First entry");
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
