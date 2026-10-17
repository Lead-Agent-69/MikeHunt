import { describe, expect, it } from "vitest";
import { getScrapeSourceId, withScrapeSourceId } from "./source-run-context";

describe("scrape source run context", () => {
  it("preserves exact adapter ids across asynchronous work", async () => {
    const seen = await Promise.all(
      ["govdeals", "autotempest"].map((sourceId) =>
        withScrapeSourceId(sourceId, async () => {
          await Promise.resolve();
          return getScrapeSourceId();
        }),
      ),
    );

    expect(seen).toEqual(["govdeals", "autotempest"]);
    expect(getScrapeSourceId()).toBeUndefined();
  });
});
