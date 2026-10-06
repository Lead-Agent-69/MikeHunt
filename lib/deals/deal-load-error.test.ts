import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DealFetchError,
  classifyDealLoadError,
  dealLoadErrorCopy,
} from "@/lib/deals/deal-load-error";

describe("deal load errors", () => {
  it("tells not-found apart from network and server failures", () => {
    expect(classifyDealLoadError(new DealFetchError(404))).toBe("not-found");
    expect(classifyDealLoadError(new DealFetchError(400))).toBe("not-found");
    expect(classifyDealLoadError(new DealFetchError(401))).toBe("auth");
    expect(classifyDealLoadError(new DealFetchError(503))).toBe("unavailable");
    expect(classifyDealLoadError(new DealFetchError(500))).toBe("unavailable");
    expect(classifyDealLoadError(new TypeError("Failed to fetch"))).toBe(
      "network",
    );
    expect(classifyDealLoadError(new Error("boom"))).toBe("unknown");
  });

  it("only blames the connection for a real network failure", () => {
    expect(dealLoadErrorCopy("not-found").title).toBe("Deal not found");
    expect(dealLoadErrorCopy("not-found").action).toBe("discover");
    expect(dealLoadErrorCopy("not-found").message).not.toMatch(/connection/i);
    expect(dealLoadErrorCopy("unavailable").message).not.toMatch(/connection/i);
    expect(dealLoadErrorCopy("network").message).toMatch(/connection/i);
  });

  it("the deal page throws DealFetchError and renders the classified copy", () => {
    const page = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");
    expect(page).toContain("throw new DealFetchError(res.status)");
    expect(page).toContain("dealLoadErrorCopy(classifyDealLoadError(error))");
    expect(page).not.toContain("Error loading deal: ");
  });
});
