import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ErrorState,
  InlineError,
  LoadingState,
} from "@/components/shared/PageStates";
import { userFacingErrorMessage } from "@/lib/user-facing-error";

const h = React.createElement;
const page = (p: string) =>
  readFileSync(`app/(dashboard)/${p}/page.tsx`, "utf8");

describe("shared page-state kit", () => {
  it("LoadingState is one polite, busy status region with a visible label", () => {
    const html = renderToStaticMarkup(
      h(LoadingState, { label: "Loading alerts…" }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading alerts…");
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });

  it("ErrorState and InlineError retry buttons say Try again", () => {
    const err = renderToStaticMarkup(
      h(ErrorState, { title: "x", message: "y", onRetry: () => {} }),
    );
    expect(err).toContain("Try again");
    expect(err).not.toContain("Try Again");
    const inline = renderToStaticMarkup(
      h(InlineError, { message: "Server down", onRetry: () => {} }),
    );
    expect(inline).toContain('role="alert"');
    expect(inline).toContain("Try again");
    expect(inline).toContain("min-h-11");
  });

  it("page copy passed through ErrorState survives the error sanitizer verbatim", () => {
    for (const msg of [
      "Saved inventory is still available on Discover and Scan — this page is not running a live market scan.",
      "Try again in a moment.",
      "Refresh in a moment, or check you're signed in.",
      "Your existing listings are still here. Try loading the next page again.",
      "This is not an empty triage deck. Saved inventory is still on Discover and Scan — retry when ready.",
      "The shop catalog didn't load. Try again in a moment.",
    ]) {
      expect(userFacingErrorMessage(msg, "fallback")).toBe(msg);
    }
  });
});

describe("pages use the shared kit", () => {
  it.each([
    ["alerts", ["InlineError", "LoadingState"]],
    ["arbitrage", ["ErrorState"]],
    ["insights", ["ErrorState", "LoadingState"]],
    ["searches", ["LoadingState"]],
    ["compare", ["LoadingState"]],
    ["feed", ["ErrorState"]],
    ["swipe", ["ErrorState"]],
    ["dealer-network", ["ErrorState", "LoadingState"]],
  ])("%s", (p, names) => {
    const src = page(p);
    expect(src).toContain('from "@/components/shared/PageStates"');
    for (const n of names) expect(src).toContain(`<${n}`);
    expect(src).not.toMatch(
      /text-center py-(8|12) text-\[var\(--t3\)\]">\s*(Loading|Finding|Comparing)/,
    );
  });

  it("errors that used to be dead ends now offer a retry", () => {
    expect(page("insights")).toContain("onRetry={() => mutateOut()}");
    const dn = page("dealer-network");
    expect(dn).toContain('throw new Error("Dealer network unavailable")');
    expect(dn).toContain("onRetry={() => mutate()}");
  });
});
