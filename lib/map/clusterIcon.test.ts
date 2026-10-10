import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLUSTER_FILL,
  CLUSTER_INK,
  clusterIconHtml,
  clusterLabel,
  clusterSize,
  majorityVerdict,
  pointVerdict,
} from "./clusterIcon";

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

describe("map cluster bubbles", () => {
  it("reads the verdict from /api/deals/map's marker type, or an explicit verdict", () => {
    expect(pointVerdict({ type: "private" })).toBe("go");
    expect(pointVerdict({ type: "auction" })).toBe("hold");
    expect(pointVerdict({ type: "dealer" })).toBe("none"); // PASS / unknown / personal desk
    expect(pointVerdict({ type: "dealer", verdict: "pass" })).toBe("pass");
  });

  it("colours by majority and falls back to grey when data is thin or tied", () => {
    expect(majorityVerdict({ go: 12, hold: 3, none: 2 })).toBe("go");
    expect(majorityVerdict({ go: 4, hold: 4 })).toBe("none");
    expect(majorityVerdict({ go: 2, none: 9 })).toBe("none");
    expect(majorityVerdict({})).toBe("none");
  });

  it("keeps #208 pin contrast: dark ink on every fill at AA", () => {
    for (const fill of Object.values(CLUSTER_FILL))
      expect(contrast(fill, CLUSTER_INK)).toBeGreaterThanOrEqual(4.5);
  });

  it("names the bubble for screen readers and says what it does", () => {
    expect(clusterLabel(23, "go")).toBe("23 listings, mostly Go. Zoom in");
    expect(clusterLabel(1204, "none")).toBe("1,204 listings. Zoom in");
    const html = clusterIconHtml(1204, "hold");
    expect(html).toContain('<span aria-hidden="true">1.2k</span>');
    expect(html).toContain("1,204 listings, mostly Hold. Zoom in");
    expect(html).toContain(`background:${CLUSTER_FILL.hold}`);
    expect(clusterSize(5)).toBe(36);
    expect(clusterSize(500)).toBe(44);
    expect(clusterSize(5000)).toBe(52);
  });
});

describe("DealerMap clustering at scale", () => {
  const src = readFileSync("components/map/DealerMap.tsx", "utf8");
  it("builds markers first and adds them once, chunked", () => {
    expect(src).toContain("chunkedLoading: true");
    expect(src).toContain("chunkInterval: 100");
    expect(src).toContain("group.addLayers(markers);");
    expect(src).not.toContain("group.addLayer(marker)");
    expect(src.indexOf("map.addLayer(group);")).toBeLessThan(
      src.indexOf("group.addLayers(markers);"),
    );
  });
  it("sets zoom behaviour and the verdict-coloured icon", () => {
    expect(src).toContain("disableClusteringAtZoom: 15");
    expect(src).toContain("spiderfyOnMaxZoom: true");
    expect(src).toContain("zoomToBoundsOnClick: true");
    expect(src).toContain("html: clusterIconHtml(n, majorityVerdict(counts))");
    expect(src).toContain("mhVerdict: pointVerdict(p)");
  });
});
