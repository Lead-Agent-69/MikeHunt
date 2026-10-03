import { describe, expect, it } from "vitest";
import { laneForSource, scanHrefForSource } from "./source-lanes";

describe("source lane mapping", () => {
  it("routes source proof links to the correct acquisition lane", () => {
    expect(laneForSource({ id: "govdeals" })).toBe("government");
    expect(laneForSource({ id: "stjames-auto" })).toBe("damaged");
    expect(laneForSource({ id: "dg-auto" })).toBe("damaged");
    expect(laneForSource({ id: "cars_com" })).toBe("clean-retail");
    expect(laneForSource({ id: "offerup" })).toBe("private");
    expect(laneForSource({ id: "carparts_com", type: "parts" })).toBe("parts");
  });

  it("builds scan links with source, lane, and profit sort", () => {
    expect(scanHrefForSource({ id: "recar" })).toBe(
      "/scan?lane=damaged&source=recar&sort=profit",
    );
    expect(scanHrefForSource({ id: "govdeals" })).toBe(
      "/scan?lane=government&source=govdeals&sort=profit",
    );
  });
});
