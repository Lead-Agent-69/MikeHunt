// Ren P1: /api/scan built `seller` as name → phone → email, and the non-flip redaction did not strip
// `seller`, so a signed-out guest could read a private seller's phone or email off a Scan card.
// Planted rows below: contact only in options.contact, contact stored AS the seller name, and a raw
// seller object. Guests and non-flip desks must get no seller name; no desk may get contact as a name.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const savedMode = vi.hoisted(() => ({ value: null as string | null }));

const PHONE = "(512) 555-0142";
const PHONE_DIGITS = "5125550142";
const EMAIL = "jane.private.seller@example.com";
const LINK = "https://www.facebook.com/profile.php?id=1000123";

const base = {
  source: "craigslist",
  source_url: "https://austin.craigslist.org/cto/d/1.html",
  year: 2016,
  make: "Honda",
  model: "Civic",
  ask_price: 6500,
  location_state: "TX",
  images: [],
  condition: "clean",
};
const ROWS = [
  // 1. No seller name; phone + email only in options.contact (main fell back to the phone).
  {
    ...base,
    id: "r1",
    options: { contact: { phone: PHONE, email: EMAIL }, sellerType: "private" },
  },
  // 2. No seller name, email only (main fell back to the email).
  { ...base, id: "r2", options: { contact: { email: EMAIL } } },
  // 3. Scraper stored the phone AS the seller name.
  { ...base, id: "r3", seller: `Call ${PHONE}`, options: {} },
  // 4. Scraper stored the email AS the seller name.
  { ...base, id: "r4", options: { seller: EMAIL } },
  // 5. Profile link as the name.
  { ...base, id: "r5", seller: LINK, options: {} },
  // 6. Raw seller object with a real name next to contact.
  {
    ...base,
    id: "r6",
    options: {
      seller: { name: "Jane Q. Private", phone: PHONE, email: EMAIL },
    },
  },
];

function query() {
  const q: any = {};
  for (const m of [
    "select",
    "eq",
    "gt",
    "gte",
    "lte",
    "lt",
    "not",
    "or",
    "ilike",
    "order",
    "limit",
    "range",
    "in",
    "is",
    "neq",
  ])
    q[m] = () => q;
  q.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: ROWS, count: ROWS.length, error: null });
  return q;
}

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: () => new Response("rate", { status: 429 }),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: (table: string) =>
      table === "user_preferences"
        ? {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: savedMode.value
                    ? { prefs: { buyerScope: { buyerMode: savedMode.value } } }
                    : null,
                  error: null,
                }),
              }),
            }),
          }
        : query(),
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => query() }),
}));

import { GET } from "./route";

async function load(mode: string | null, signedIn: boolean) {
  getServerUser.mockResolvedValue({
    data: { user: signedIn ? { id: "user-1" } : null },
    error: null,
  });
  savedMode.value = mode;
  const res = await GET(new NextRequest("https://app.test/api/scan?state=TX"));
  expect(res.status).toBe(200);
  return (await res.json()) as {
    vehicles: Array<Record<string, any>>;
    deskAccess: string;
  };
}

function hasContact(text: string) {
  return (
    text.includes(EMAIL) ||
    text.includes("@example.com") ||
    text.includes("555-0142") ||
    text.replace(/\D/g, "").includes(PHONE_DIGITS) ||
    text.includes("profile.php")
  );
}

describe("GET /api/scan never sends seller contact as the seller", () => {
  beforeEach(() => {
    getServerUser.mockReset();
    savedMode.value = null;
  });

  it.each([
    ["signed-out guest", null, false],
    ["saved personal", "personal", true],
    ["saved parts", "parts", true],
    ["no saved mode", null, true],
  ] as const)(
    "%s gets no seller name and no contact anywhere",
    async (_l, mode, signedIn) => {
      const body = await load(mode, signedIn);
      expect(body.deskAccess).toBe("personal");
      expect(body.vehicles).toHaveLength(ROWS.length);
      for (const v of body.vehicles) {
        expect(v.seller).toBeUndefined();
        expect(v.sellerName).toBeUndefined();
        expect(v).not.toHaveProperty("sellerPhone");
        expect(v).not.toHaveProperty("sellerEmail");
        expect(v).not.toHaveProperty("sellerContactUrl");
        expect(hasContact(JSON.stringify(v))).toBe(false);
      }
    },
  );

  it.each(["dealer", "reseller"])(
    "a saved %s desk gets a seller name, never a phone/email/link as the name",
    async (mode) => {
      const body = await load(mode, true);
      expect(body.deskAccess).toBe("flip");
      const byId = new Map(body.vehicles.map((v) => [String(v.id), v]));
      for (const v of body.vehicles) {
        expect(hasContact(String(v.seller ?? ""))).toBe(false);
      }
      // Real name survives; contact-only rows fall back to the source label, not the contact.
      expect(byId.get("r6")?.seller).toBe("Jane Q. Private");
      expect(byId.get("r1")?.seller).toBe("Craigslist");
      // Flip desks still get contact in its own fields.
      expect(byId.get("r1")?.sellerPhone).toBe(PHONE);
    },
  );
});
