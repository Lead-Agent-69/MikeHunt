import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

const html = readFileSync("public/offline.html", "utf8");
const script = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).at(
  -1,
)![1];
function offlinePage(path: string, online = true) {
  const nodes: Record<string, { textContent: string }> = {
    title: { textContent: "" },
    message: { textContent: "" },
    status: { textContent: "" },
  };
  const location = { pathname: path, assign: vi.fn(), reload: vi.fn() };
  const page: any = {
    window: { location, addEventListener: vi.fn() },
    document: { getElementById: (id: string) => nodes[id] },
    navigator: { onLine: online },
  };
  runInNewContext(script, page);
  return { page, location, nodes };
}
it("returns a direct offline-page visit to the app instead of trapping it in reloads", () => {
  const h = offlinePage("/offline.html");
  h.page.retryConnection();
  expect(h.location.assign).toHaveBeenCalledWith("/market");
  expect(h.location.reload).not.toHaveBeenCalled();
});
it.each(["/market", "/discover", "/deal/car"])(
  "retries the original %s route when the worker serves the fallback",
  (path) => {
    const h = offlinePage(path);
    h.page.retryConnection();
    expect(h.location.reload).toHaveBeenCalledOnce();
    expect(h.location.assign).not.toHaveBeenCalled();
  },
);
it("distinguishes online connection failure from an offline device without auto-navigation", () => {
  const online = offlinePage("/market"),
    offline = offlinePage("/market", false);
  expect(online.nodes.message.textContent).toContain("device appears online");
  expect(offline.nodes.title.textContent).toBe("You're Offline");
  expect(online.location.reload).not.toHaveBeenCalled();
  expect(offline.location.assign).not.toHaveBeenCalled();
});
