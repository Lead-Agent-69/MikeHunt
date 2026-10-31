import { it, expect } from "vitest";
import { matchEvidence, emailText } from "./match-evidence";
import { briefCandidate } from "@/lib/deals/__fixtures__/brief-candidate";
it("legacy modeled profit is not an outbound claim", () => {
  const result = matchEvidence({ askPrice: 2180 });
  expect(result.price).toContain("Unverified advertised amount");
  expect(result.profit).toContain("not established");
});
it("uses current evidence rather than a caller's modeled profit", () => {
  const result = matchEvidence({
    askPrice: 1,
    listingEvidence: briefCandidate(),
  });
  expect(result.price).toContain("$10,000");
  expect(result.profit).toContain("$4,100");
  expect(
    matchEvidence({
      askPrice: 10000,
      listingEvidence: { ...briefCandidate(), deal_analysis: {} },
    }).profit,
  ).toContain("not established");
});
it("payment and auction amounts retain their meaning", () => {
  const row = {
    ...briefCandidate(),
    price_evidence: { kind: "down_payment", listedAmount: 2180 },
    ask_price: 2180,
  };
  expect(
    matchEvidence({ askPrice: 2180, listingEvidence: row }).price,
  ).toContain("down payment");
  expect(
    matchEvidence({ askPrice: 2180, listingEvidence: row }).profit,
  ).toContain("not established");
});
it("escapes source text in outbound HTML", () =>
  expect(emailText('<b title="x">&\'</b>')).toBe(
    "&lt;b title=&quot;x&quot;&gt;&amp;&#39;&lt;/b&gt;",
  ));
