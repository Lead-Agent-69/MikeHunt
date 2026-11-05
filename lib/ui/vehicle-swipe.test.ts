import { expect, it } from "vitest";
import { vehicleSwipeDecision } from "./vehicle-swipe";

it.each([280, 390, 768])(
  "keeps gesture meaning consistent at %ipx",
  (width) => {
    expect(vehicleSwipeDecision(width * 0.3, 0, width)).toBe("save");
    expect(vehicleSwipeDecision(-width * 0.3, 0, width)).toBe("pass");
    expect(vehicleSwipeDecision(width * 0.12, width * 2, width)).toBe("save");
    expect(vehicleSwipeDecision(-width * 0.12, -width * 2, width)).toBe("pass");
    expect(vehicleSwipeDecision(width * 0.1, width * 5, width)).toBeNull();
    expect(vehicleSwipeDecision(width * 0.2, -width * 2, width)).toBeNull();
    expect(vehicleSwipeDecision(width * 0.2, 0, width)).toBeNull();
  },
);
it("cannot commit an invalid or unmeasured gesture", () => {
  expect(vehicleSwipeDecision(200, 800, 0)).toBeNull();
  expect(vehicleSwipeDecision(NaN, 800, 390)).toBeNull();
  expect(vehicleSwipeDecision(100, Infinity, 390)).toBeNull();
});
