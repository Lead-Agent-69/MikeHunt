import { beforeEach, describe, expect, it, vi } from "vitest";
import { paginate, type ScraperConfig } from "./engine";

const { fetchPage, close } = vi.hoisted(() => ({
  fetchPage: vi.fn(),
  close: vi.fn(),
}));

vi.mock("./adaptive-engine", () => ({
  AdaptiveEngine: class {
    fetch = fetchPage;
  },
}));

const config: ScraperConfig = {
  name: "test",
  baseUrl: "https://example.com",
  renderMode: "adaptive",
  requestDelay: 0,
  concurrency: 1,
  useProxies: false,
  stealth: false,
  maxPages: 3,
};

describe("crawler cancellation and cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    close.mockResolvedValue(undefined);
    fetchPage.mockResolvedValue({ html: "inventory", close });
  });

  it("does not fetch when cancelled before pagination", async () => {
    const controller = new AbortController();
    controller.abort(new Error("deadline"));
    const pages = paginate(
      { ...config, abortSignal: controller.signal },
      () => config.baseUrl,
      async () => ({ items: [1], hasMore: true }),
    );
    await expect(pages.next()).rejects.toThrow("deadline");
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("closes the page and never yields results if cancelled during parsing", async () => {
    const controller = new AbortController();
    const pages = paginate(
      { ...config, abortSignal: controller.signal },
      () => config.baseUrl,
      async () => {
        controller.abort(new Error("deadline"));
        return { items: [1], hasMore: true };
      },
    );
    await expect(pages.next()).rejects.toThrow("deadline");
    expect(close).toHaveBeenCalledOnce();
    expect(fetchPage).toHaveBeenCalledOnce();
  });

  it("closes the page when parsing fails", async () => {
    const pages = paginate(
      config,
      () => config.baseUrl,
      async () => {
        throw new Error("invalid inventory");
      },
    );
    await expect(pages.next()).rejects.toThrow("invalid inventory");
    expect(close).toHaveBeenCalledOnce();
  });
});
