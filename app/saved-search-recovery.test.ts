import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  mode: "personal",
  user: { id: "user-one" } as { id: string } | null,
  authError: null as { name: string } | null,
  readError: null as object | null,
  writeError: null as object | null,
  confirmed: true,
  rows: [] as Record<string, unknown>[],
  calls: [] as unknown[][],
}));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({ intent: { buyerMode: state.mode } }),
}));
vi.mock("@/lib/supabase", () => ({
  createClientComponentClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.user },
        error: state.authError,
      }),
    },
    from: () => {
      let operation = "read";
      const result = () =>
        operation === "read"
          ? { data: state.rows, error: state.readError }
          : {
              data: state.confirmed ? [{ id: "search-one" }] : [],
              error: state.writeError,
            };
      const query = {
        select: (_: string) => query,
        eq: (field: string, value: unknown) => {
          state.calls.push(["eq", field, value]);
          return query;
        },
        order: async () => result(),
        insert: (payload: unknown) => {
          operation = "insert";
          state.calls.push(["insert", payload]);
          return query;
        },
        update: (payload: unknown) => {
          operation = "update";
          state.calls.push(["update", payload]);
          return query;
        },
        delete: () => {
          operation = "delete";
          state.calls.push(["delete"]);
          return query;
        },
        single: async () => {
          const r = result();
          return { ...r, data: r.data[0] || null };
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  }),
}));
import SearchesPage from "@/app/(dashboard)/searches/page";
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(state, {
    mode: "personal",
    user: { id: "user-one" },
    authError: null,
    readError: null,
    writeError: null,
    confirmed: true,
    rows: [],
    calls: [],
  });
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(React.createElement(SearchesPage)));
}
async function click(text: string) {
  await act(async () =>
    Array.from(host.querySelectorAll("button"))
      .find((b) => b.textContent === text)!
      .click(),
  );
}
async function fill(label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
describe("saved-search recovery", () => {
  it("distinguishes failed account reads from a successful empty account and offers retry", async () => {
    state.readError = { message: "unavailable" };
    await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "could not be loaded",
    );
    expect(host.textContent).not.toContain("No saved searches");
    state.readError = null;
    await click("Retry");
    expect(host.textContent).toContain("No saved searches");
  });
  it.each(["error", "zero rows"])(
    "preserves entered fields when save is unconfirmed: %s",
    async (failure) => {
      await render();
      await click("New search");
      await fill("Search name", "Honda shortlist");
      state.writeError = failure === "error" ? { message: "denied" } : null;
      state.confirmed = failure !== "zero rows";
      await click("Save search");
      expect(
        host.querySelector<HTMLInputElement>('input[aria-label="Search name"]')
          ?.value,
      ).toBe("Honda shortlist");
      expect(host.textContent).toContain("not confirmed saved");
      expect(host.querySelector("fieldset")?.disabled).toBe(false);
    },
  );
  it("confirms saved rows before closing the form and does not put profit criteria in a personal search", async () => {
    await render();
    await click("New search");
    expect(host.textContent).not.toContain("Min Net Profit");
    expect(host.textContent).not.toContain("BUY deals only");
    await click("Save search");
    expect(host.querySelector("form")).toBeNull();
    const inserted = state.calls.find((c) => c[0] === "insert")?.[1];
    expect(inserted).toMatchObject({
      user_id: "user-one",
      target_profit: null,
      require_go: false,
    });
    // Server-only columns must never be sent: authenticated INSERT is column-limited (42501).
    for (const key of ["notify_sms", "last_run_at", "created_at", "id"]) {
      expect(inserted).not.toHaveProperty(key);
    }
  });
  it("keeps failed pause/delete actions visible and scopes each write to the authenticated owner", async () => {
    state.rows = [{ id: "search-one", name: "Honda", is_active: true }];
    await render();
    state.writeError = { message: "denied" };
    await click("Pause");
    expect(host.textContent).toContain("not confirmed changed");
    expect(host.textContent).toContain("Pause");
    await click("Delete");
    expect(host.textContent).toContain("Deletion was not confirmed");
    expect(host.textContent).toContain("Honda");
    expect(
      state.calls.filter((c) => c[0] === "eq" && c[1] === "user_id"),
    ).toHaveLength(3);
  });
  it("does not create a local search when authentication fails, and rejects reversed year bounds", async () => {
    await render();
    await click("New search");
    await fill("Min Year", "2025");
    await fill("Max Year", "2020");
    await click("Save search");
    expect(host.textContent).toContain("Minimum year must not exceed");
    await fill("Max Year", "2026");
    state.authError = { name: "AuthRetryableFetchError" };
    await click("Save search");
    expect(host.textContent).toContain("not confirmed saved");
    expect(state.calls.some((c) => c[0] === "insert")).toBe(false);
    expect(localStorage.length).toBe(0);
  });
  it("keeps dealer criteria and labels device-only saves without promising notifications", async () => {
    state.mode = "dealer";
    state.user = null;
    await render();
    await click("New search");
    expect(host.textContent).toContain("Min Net Profit");
    await click("Save search");
    expect(host.textContent).toContain("Device only. No automatic alerts.");
    expect(host.textContent).not.toContain("Sign in later to sync alerts");
  });
});
