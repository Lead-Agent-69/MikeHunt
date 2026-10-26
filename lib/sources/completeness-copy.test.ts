import { expect, it } from "vitest";
import {
  detailCompletenessCopy,
  COMPLETENESS_EXPLANATION,
} from "./completeness-copy";

it("describes reported fields without suggesting condition or accuracy is verified", () => {
  expect(detailCompletenessCopy(100)).toBe("100% of details reported");
  expect(detailCompletenessCopy(0)).toBe("0% of details reported");
  expect(detailCompletenessCopy(68.7)).toBe("69% of details reported");
  expect(COMPLETENESS_EXPLANATION).toContain(
    "does not verify the price, title, condition, or availability",
  );
  expect(detailCompletenessCopy(100)).not.toMatch(
    /excellent|accurate|verified|quality/i,
  );
});
it.each([null, undefined, NaN, Infinity, -1, 101, "100"])(
  "does not turn an invalid score into confident copy: %s",
  (score) => {
    expect(detailCompletenessCopy(score)).toBe("Details not assessed");
  },
);
