// Ren P1 sweep: every URL → source attribution matches on the hostname, never a URL substring.
import { describe, expect, it } from "vitest";
import {
  canonicalSource,
  dealerSourceIdFromUrl,
  sourceFromUrl,
} from "@/lib/sources/source-meta";
import { gatedSourceForRow } from "@/lib/deals/freshness";
import { mapOriginToSource } from "@/lib/scrapers/sources/autotempest";

describe("sourceFromUrl / dealerSourceIdFromUrl", () => {
  it("does not attribute a URL by its query string or path", () => {
    expect(sourceFromUrl("https://attacker.example/x?govdeals.com")).toBeNull();
    expect(sourceFromUrl("https://attacker.example/gsa.gov/lot")).toBeNull();
    expect(
      dealerSourceIdFromUrl("https://attacker.example/?recar.com"),
    ).toBeNull();
  });
  it("does not match a look-alike host", () => {
    expect(dealerSourceIdFromUrl("https://notrecar.com/inv/1")).toBeNull();
    expect(dealerSourceIdFromUrl("https://nodamage.com/inv/1")).toBeNull();
    expect(sourceFromUrl("https://mygovdeals.com/x")).toBeNull();
  });
  it("still matches real hosts and subdomains", () => {
    expect(sourceFromUrl("https://www.govdeals.com/asset/1")).toBe("govdeals");
    expect(sourceFromUrl("https://www.publicsurplus.com/sms/x")).toBe(
      "publicsurplus",
    );
    expect(sourceFromUrl("https://gsaauctions.gov/auctions/1")).toBe(
      "gsa_auctions",
    );
    expect(sourceFromUrl("https://www.allsurplus.com/x")).toBe("allsurplus");
    expect(dealerSourceIdFromUrl("https://www.recar.com/inv/1")).toBe("recar");
    expect(dealerSourceIdFromUrl("https://inventory.damage.com/1")).toBe(
      "damage-com",
    );
  });
});

describe("cars.com is not classiccars.com", () => {
  it("canonicalSource keeps the whole cars token", () => {
    expect(canonicalSource("cars_com")).toBe("cars_com");
    expect(canonicalSource("cars.com")).toBe("cars_com");
    expect(canonicalSource("classiccars_com")).not.toBe("cars_com");
    expect(canonicalSource("classiccars.com")).not.toBe("cars_com");
  });
  it("AutoTempest origin ClassicCars.com is not Cars.com", () => {
    expect(mapOriginToSource("Cars.com")).toBe("cars_com");
    expect(mapOriginToSource("ClassicCars.com")).toBe("independent_dealer");
  });
});

describe("freshness Copart gate", () => {
  it("gates a real Copart URL, not a URL that only mentions copart.com", () => {
    expect(
      gatedSourceForRow({ sourceUrl: "https://www.copart.com/lot/1" } as any),
    ).toBe("copart");
    expect(
      gatedSourceForRow({
        sourceUrl: "https://attacker.example/lot/1?copart.com",
      } as any),
    ).toBeNull();
  });
});
