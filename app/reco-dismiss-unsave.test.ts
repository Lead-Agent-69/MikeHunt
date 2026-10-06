import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@/lib/reco/client", () => ({
  sendDealSignal: (i: unknown) => send(i),
}));

import { signalDismiss, signalUnsave } from "@/components/reco/deal-signals";

const DEAL = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

beforeEach(() => send.mockReset());

describe("reco dismiss / unsave signals", () => {
  it("sends unsave and dismiss through the client for a real deal id", () => {
    signalUnsave(DEAL);
    signalDismiss(DEAL);
    expect(send.mock.calls).toEqual([
      [{ dealId: DEAL, kind: "unsave" }],
      [{ dealId: DEAL, kind: "dismiss" }],
    ]);
  });

  it("sends nothing without a UUID deal id", () => {
    for (const id of [undefined, null, "", "live-123", 42]) {
      signalUnsave(id);
      signalDismiss(id);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("fires only after the existing delete actions succeed", () => {
    const saved = readFileSync("app/(dashboard)/saved/page.tsx", "utf8");
    const alerts = readFileSync("app/(dashboard)/alerts/page.tsx", "utf8");
    expect(saved).toMatch(
      /if \(res\.ok\) \{[\s\S]{0,200}signalUnsave\(dealId\)/,
    );
    expect(alerts).toContain("if (res.ok) signalDismiss(dealId);");
    expect(alerts).toContain("if (res.ok) signalUnsave(dealId);");
    expect(alerts).toContain("?.deals?.id");
  });
});
