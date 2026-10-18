import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  load: vi.fn(),
}));
vi.mock("./market-value", () => ({ loadMarketIndex: mocks.load }));
vi.mock("./deal-analyzer", () => ({ analyzeDeal: mocks.analyze }));
import { computeValuationAccuracy } from "./accuracy";

function database(size = 300) {
  const q: any = {};
  for (const method of ["select", "eq", "in", "gt", "lt"]) q[method] = () => q;
  q.range = async () => ({
    data: Array.from({ length: size }, () => ({ ask_price: 10_000 })),
    error: null,
  });
  return { from: () => q } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.analyze.mockReturnValue({
    sellEstimate: 9300,
    sellBasis: "comparables",
  });
});

it("identifies an exact proxy match as in-sample asking-price evidence, never sale accuracy", async () => {
  const result = await computeValuationAccuracy(database());
  expect(result).toMatchObject({
    basis: "asking_price_proxy",
    sampleMode: "in_sample",
    assumedDiscountPct: 7,
    n: 60,
    mape: 0,
  });
  expect(mocks.load).toHaveBeenCalledTimes(1);
});

it.each([0, NaN, Infinity, -100])(
  "does not publish a metric for invalid estimates: %s",
  async (value) => {
    mocks.analyze.mockReturnValue({
      sellEstimate: value,
      sellBasis: "comparables",
    });
    expect(await computeValuationAccuracy(database())).toBeNull();
  },
);

it("requires enough non-baseline observations", async () => {
  expect(await computeValuationAccuracy(database(100))).toBeNull();
  mocks.analyze.mockReturnValue({ sellEstimate: 9300, sellBasis: "baseline" });
  expect(await computeValuationAccuracy(database())).toBeNull();
});
