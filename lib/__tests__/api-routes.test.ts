/**
 * API Route Tests — Auth-gate & input-validation smoke tests.
 * Tests route handlers directly (no dev server needed), mocking only Supabase.
 *
 * Scope: auth gates (401) and input validation (400/503).
 * Complex routes that depend on DealsService/scraperRegistry are integration
 * tests and require a test DB — tracked as a follow-up.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ---- Supabase mock ----------------------------------------------------------
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  })),
  createClientComponentClient: vi.fn(),
  getSupabaseClient: vi.fn(),
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/server-supabase", () => ({
  getServerUser: vi.fn().mockResolvedValue({
    data: { user: null },
    error: { message: "Not authenticated" },
  }),
}));

// Helper: build a minimal NextRequest
function makeRequest(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  const url = `http://localhost:3000${path}`;
  return new NextRequest(url, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...opts.headers },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

// ---- /api/ingest (browser extension write path) ----------------------------
describe("POST /api/ingest", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { delete process.env.INGEST_SECRET; });

  it("returns 503 in production when INGEST_SECRET is missing", async () => {
    const orig = process.env.NODE_ENV;
    // @ts-expect-error override for test
    process.env.NODE_ENV = "production";
    delete process.env.INGEST_SECRET;
    const { POST } = await import("@/app/api/ingest/route");
    const req = makeRequest("/api/ingest", {
      method: "POST",
      body: { url: "https://example.com", price: 5000, title: "2019 Ford F-150" },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    // @ts-expect-error reset
    process.env.NODE_ENV = orig;
  });

  it("returns 401 when INGEST_SECRET is set but header is missing", async () => {
    process.env.INGEST_SECRET = "test-secret-123";
    const { POST } = await import("@/app/api/ingest/route");
    const req = makeRequest("/api/ingest", {
      method: "POST",
      body: { url: "https://example.com", price: 5000, title: "2019 Ford F-150" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    delete process.env.INGEST_SECRET;
    const { POST } = await import("@/app/api/ingest/route");
    const req = makeRequest("/api/ingest", {
      method: "POST",
      body: { url: "https://example.com" }, // missing price + title
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ---- /api/save-from-url (auth required) ------------------------------------
describe("POST /api/save-from-url", () => {
  it("returns 401 when user is not authenticated", async () => {
    const { POST } = await import("@/app/api/save-from-url/route");
    const req = makeRequest("/api/save-from-url", {
      method: "POST",
      body: { url: "https://craigslist.org/car/123" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

// ---- /api/auth/whoami (no-op when not authed) -------------------------------
describe("GET /api/auth/whoami", () => {
  it("returns 200 with null user when not authed (graceful)", async () => {
    const { GET } = await import("@/app/api/auth/whoami/route");
    const res = await (GET as () => Promise<Response>)();
    // whoami is intentionally graceful — returns 200 with null email
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("email");
    expect(body).toHaveProperty("isAdmin");
  });
});

// ---- CORS preflight on /api/ingest -----------------------------------------
describe("OPTIONS /api/ingest", () => {
  it("returns 204 with CORS headers for browser extension preflight", async () => {
    const { OPTIONS } = await import("@/app/api/ingest/route");
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});
