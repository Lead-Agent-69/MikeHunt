import { expect, it } from "vitest";
import { POST } from "./api/billing/checkout/route";
import { GET } from "./api/checkout/beta-access/route";
it("retired checkout cannot create payment sessions", async () => {
  const res = await POST();
  expect(res.status).toBe(410);
  expect((await res.json()).upgradeUrl).toBe("/upgrade");
  expect(
    (
      await GET(new Request("http://localhost/api/checkout/beta-access"))
    ).headers.get("location"),
  ).toBe("http://localhost/upgrade");
});
