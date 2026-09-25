import { describe, it, expect } from "vitest";
import { fitHtml, fitText } from "./content-clean";

const PAGE = `<!doctype html><html><head><title>x</title>
<script>var a=1;</script><style>.x{}</style></head>
<body>
  <header id="site-header"><a href="/">Home</a><a href="/login">Login</a></header>
  <nav class="main-nav"><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></nav>
  <div class="ad-slot"><a href="http://ads.example/x">Buy now cheap deals click here</a></div>
  <main>
    <article>
      <h1>2018 Honda Accord EX-L</h1>
      <p>Clean title, one owner, 42,000 miles. Recently serviced with new brakes and tires. Priced to sell at a fair market value below comparable listings in the area.</p>
      <p>The interior is in excellent condition with leather seats and no visible wear. Carfax available on request.</p>
    </article>
  </main>
  <aside class="sidebar"><a href="/x">Related junk</a><a href="/y">More junk</a></aside>
  <footer class="site-footer"><a href="/tos">Terms</a><a href="/privacy">Privacy</a> Copyright 2026</footer>
</body></html>`;

describe("content-clean (PruningContentFilter port)", () => {
  it("keeps the real article content", () => {
    const text = fitText(PAGE);
    expect(text).toContain("2018 Honda Accord");
    expect(text).toContain("Clean title, one owner");
    expect(text).toContain("Carfax available");
  });

  it("strips nav, header, footer, ads, and sidebar boilerplate", () => {
    const text = fitText(PAGE).toLowerCase();
    expect(text).not.toContain("login");
    expect(text).not.toContain("buy now cheap");
    expect(text).not.toContain("related junk");
    expect(text).not.toContain("privacy");
  });

  it("drops scripts and styles entirely", () => {
    const html = fitHtml(PAGE);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("var a=1");
    expect(html).not.toContain("<style");
  });

  it("is safe on empty / junk input", () => {
    expect(fitHtml("")).toBe("");
    expect(fitText("")).toBe("");
    expect(fitText("<div></div>")).toBe("");
  });
});
