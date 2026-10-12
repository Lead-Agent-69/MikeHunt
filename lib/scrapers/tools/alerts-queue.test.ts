import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pushCount: 0,
  optedOut: false,
  prefsError: null as unknown,
  push: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/notifications/push", () => ({ sendPushToUser: mocks.push }));
import { ScraperAlertService } from "./alerts";

const alert = {
  id: "alert-1",
  userId: "buyer-1",
  dealId: "car-1",
  oldPrice: 2000,
  newPrice: 1800,
  dropAmount: 200,
  dropPercentage: 10,
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.pushCount = 0;
  mocks.optedOut = false;
  mocks.prefsError = null;
  mocks.push.mockImplementation(async () => mocks.pushCount);
  mocks.from.mockReturnValue({
    select: () => ({
      in: async () => ({
        error: mocks.prefsError,
        data: [{ user_id: "buyer-1", notify_price_drops: !mocks.optedOut }],
      }),
    }),
  });
});

describe("price-drop queue acknowledgement", () => {
  const setup = (emailAccepted = false) => {
    const service = new ScraperAlertService({
      supabaseUrl: "https://fixture.supabase.co",
      supabaseKey: "fixture",
    });
    vi.spyOn(service, "getPendingPriceDropAlerts").mockResolvedValue([alert]);
    vi.spyOn(service, "sendPriceDropEmail").mockResolvedValue(emailAccepted);
    const mark = vi.spyOn(service, "markAlertSent").mockResolvedValue();
    return { service, mark };
  };
  it("keeps undeliverable alerts queued rather than reporting them sent", async () => {
    const { service, mark } = setup();
    expect(await service.processAlerts()).toEqual({
      processed: 1,
      emailsSent: 0,
      pushesSent: 0,
    });
    expect(mark).not.toHaveBeenCalled();
  });
  it("acknowledges an email accepted by its provider", async () => {
    const { service, mark } = setup(true);
    await service.processAlerts();
    expect(mark).toHaveBeenCalledWith("alert-1");
  });
  it("acknowledges a push accepted by its provider", async () => {
    mocks.pushCount = 1;
    const { service, mark } = setup();
    expect((await service.processAlerts()).pushesSent).toBe(1);
    expect(mark).toHaveBeenCalledWith("alert-1");
  });
  it("does not send or consume alerts when preference verification fails", async () => {
    mocks.prefsError = { message: "database unavailable" };
    const { service, mark } = setup(true);
    await expect(service.processAlerts()).rejects.toThrow(
      "Could not verify notification preferences",
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(service.sendPriceDropEmail).not.toHaveBeenCalled();
    expect(mark).not.toHaveBeenCalled();
  });
  it("respects opt-out without sending or retrying suppressed alerts", async () => {
    mocks.optedOut = true;
    const { service, mark } = setup();
    await service.processAlerts();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(service.sendPriceDropEmail).not.toHaveBeenCalled();
    expect(mark).toHaveBeenCalledWith("alert-1");
  });
});
