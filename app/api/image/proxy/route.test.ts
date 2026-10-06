import { describe, expect, it } from "vitest";
import { isAllowedImageUrl } from "./route";

describe("image proxy host safety", () => {
  it.each([
    "https://webassets.lqdt1.com/assets/photo.jpg",
    "https://d37qv0n5b4mbzm.cloudfront.net/photo.jpg",
    "https://gsa-prod-ppms-attachments-prod.s3.amazonaws.com/photo.jpg",
    "https://cs.copart.com/v1/AUTH_svc.pdoc00001/PIX123.jpg",
    "https://www.recar.com/images/car.jpg",
    "https://rebuilders.stjamesautoparts.com/images/car.jpg",
    "https://www.dgautollc.com/images/car.jpg",
    "https://i.dealerzone.com/photo.jpg",
  ])("allows a verified live inventory image host: %s", (url) => {
    expect(isAllowedImageUrl(url)).toBe(true);
  });

  it.each([
    "http://127.0.0.1:3000/api/system/status",
    "http://169.254.169.254/latest/meta-data",
    "https://lqdt1.com.attacker.example/photo.jpg",
    "file:///C:/Windows/System32/drivers/etc/hosts",
    "not-a-url",
  ])("rejects private, lookalike, or invalid targets: %s", (url) => {
    expect(isAllowedImageUrl(url)).toBe(false);
  });
});

describe("GET /api/image/proxy hop safety", () => {
  it("403s a non-allowlisted URL before any fetch", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new Request(
        "https://app.test/api/image/proxy?url=" +
          encodeURIComponent("http://169.254.169.254/latest/meta-data"),
      ),
    );
    expect(res.status).toBe(403);
  });
});
