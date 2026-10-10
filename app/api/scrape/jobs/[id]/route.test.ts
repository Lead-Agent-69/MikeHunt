import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    select: mocks.select,
    eq: mocks.eq,
    maybeSingle: mocks.maybeSingle,
  };
  mocks.from.mockReturnValue(query);
  mocks.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.getUser.mockResolvedValue({ data: { user: { id: "buyer-1" } } });
});

describe("customer collection status", () => {
  it("restricts status to its owner and removes raw runner diagnostics", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: "job-1",
        status: "failed",
        error_message: "service_role secret-key",
        result: {
          total: 1,
          failed: 1,
          results: [
            {
              source: "dealer",
              success: false,
              error: "secret-key",
              metadata: { token: "secret-key" },
            },
          ],
        },
      },
      error: null,
    });
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("https://app.test/api/scrape/jobs/job-1"),
      { params: Promise.resolve({ id: "job-1" }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith("requested_by", "buyer-1");
    expect(mocks.select).toHaveBeenCalledWith(
      expect.stringContaining("heartbeat_at"),
    );
    const body = await response.json();
    expect(JSON.stringify(body)).not.toMatch(
      /secret-key|service_role|metadata/,
    );
    expect(body.job.error_message).toContain("Please retry");
  });

  it("rejects anonymous access before reading any jobs", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("https://app.test/api/scrape/jobs/job-1"),
      { params: Promise.resolve({ id: "job-1" }) },
    );
    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not disclose jobs belonging to another buyer", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("https://app.test/api/scrape/jobs/job-2"),
      { params: Promise.resolve({ id: "job-2" }) },
    );
    expect(response.status).toBe(404);
    expect(mocks.eq).toHaveBeenCalledWith("requested_by", "buyer-1");
  });
});
