import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const modal = () =>
  readFileSync("components/deal/CashOfferLetterModal.tsx", "utf8");

describe("Cash offer letter honesty", () => {
  it("has no fabricated buyer identity defaults", () => {
    const src = modal();
    expect(src).not.toMatch(/Vanguard/i);
    expect(src).not.toContain("mikehuntcars.com");
    expect(src).not.toMatch(/\(555\)|555-\d{4}/);
    expect(src).toContain('const [buyerName, setBuyerName] = useState("");');
    expect(src).toContain('const [buyerPhone, setBuyerPhone] = useState("");');
    expect(src).toContain('const [buyerEmail, setBuyerEmail] = useState("");');
    expect(src).toContain('placeholder="Your business name"');
  });

  it("only pre-fills from the signed-in user's saved profile", () => {
    const src = modal();
    expect(src).toContain('fetch("/api/profile"');
    expect(src).toContain("data.local");
  });

  it("is labelled a non-binding draft, never an instant binding LOI", () => {
    const src = modal();
    expect(src).not.toMatch(/instant binding/i);
    expect(src).not.toMatch(/active and binding/i);
    expect(src).not.toContain("OFFICIAL CASH PURCHASE PROPOSAL");
    expect(src).toContain("Draft letter of intent (non-binding)");
    expect(src).toContain("doesn&apos;t send this letter to anyone");
    expect(src).toContain("doesn&apos;t make a");
  });

  it("does not send anything itself (copy and print only)", () => {
    const src = modal();
    expect(src).toContain("navigator.clipboard.writeText");
    expect(src).toContain("window.print()");
    expect(src).not.toMatch(/method:\s*["']POST["']/);
  });
});

describe("no fabricated contact identities in user-facing code", () => {
  it("mikehuntcars.com and Vanguard appear nowhere in components/app pages", () => {
    for (const f of [
      "components/deal/CashOfferLetterModal.tsx",
      "components/deal/AutonomousSellerNegotiator.tsx",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toContain("mikehuntcars.com");
      expect(src, f).not.toMatch(/Vanguard Acquisition/);
    }
  });
});
