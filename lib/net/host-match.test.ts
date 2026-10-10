import { describe, expect, it } from "vitest";
import { hostMatches, hostOf, urlHostMatches } from "./host-match";

describe("hostOf", () => {
  it("returns the lowercased hostname of an http(s) URL", () => {
    expect(hostOf("https://WWW.Copart.com/lot/123")).toBe("www.copart.com");
    expect(hostOf("http://sfbay.craigslist.org/cto/d/1.html")).toBe(
      "sfbay.craigslist.org",
    );
    expect(hostOf("copart.com/lot/1")).toBe("copart.com");
    expect(hostOf("https://copart.com./lot/1")).toBe("copart.com");
  });
  it("ignores the path, query and fragment", () => {
    expect(hostOf("https://attacker.example/lot/1?copart.com#copart.com")).toBe(
      "attacker.example",
    );
    expect(hostOf("https://copart.com@attacker.example/lot/1")).toBe(
      "attacker.example",
    );
  });
  it("rejects non-http schemes and garbage", () => {
    expect(hostOf("javascript:alert(1)//copart.com")).toBeNull();
    expect(hostOf("ftp://copart.com/x")).toBeNull();
    expect(hostOf("")).toBeNull();
    expect(hostOf(null)).toBeNull();
    expect(hostOf("http://")).toBeNull();
  });
});

describe("hostMatches / urlHostMatches", () => {
  it("matches the domain and its subdomains only", () => {
    expect(hostMatches("copart.com", "copart.com")).toBe(true);
    expect(hostMatches("www.copart.com", "copart.com")).toBe(true);
    expect(hostMatches("notcopart.com", "copart.com")).toBe(false);
    expect(hostMatches("copart.com.attacker.example", "copart.com")).toBe(
      false,
    );
    expect(hostMatches("classiccars.com", "cars.com")).toBe(false);
    expect(hostMatches("www.cars.com", "cars.com")).toBe(true);
  });
  it("never matches on the query string", () => {
    expect(
      urlHostMatches("https://attacker.example/lot/1?copart.com", [
        "copart.com",
      ]),
    ).toBe(false);
    expect(
      urlHostMatches("https://www.classiccars.com/l/1", ["cars.com"]),
    ).toBe(false);
  });
});
