// Temporary UI/UX audit sweep across viewports. Delete after use.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "C:/Users/VCTRYSESN/AppData/Local/Temp/ui-audit";
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

const PUBLIC_PAGES = ["/", "/login", "/register", "/scan"];
const DASH_PAGES = [
  "/find", "/today", "/swipe", "/best-buy", "/deal-check", "/fleet",
  "/alerts", "/settings", "/upgrade", "/compare", "/feed", "/market",
  "/map", "/saved", "/discover",
];

const results = [];
const browser = await chromium.launch();

async function auditPage(page, path, vp) {
  const errors = [];
  const onConsole = (msg) => {
    if (msg.type() === "error") errors.push(msg.text().slice(0, 300));
  };
  page.on("console", onConsole);
  let status = null;
  try {
    const resp = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
    status = resp?.status();
    await page.waitForTimeout(1200);
  } catch (e) {
    errors.push("NAV: " + e.message.slice(0, 200));
  }
  const audit = await page.evaluate(() => {
    const de = document.documentElement;
    const vw = window.innerWidth;
    const overflowX = de.scrollWidth - vw;
    // elements sticking out horizontally
    const wide = [];
    const all = document.querySelectorAll("*");
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 2) {
        const cls = (el.className && el.className.toString ? el.className.toString() : "").slice(0, 80);
        wide.push(`${el.tagName}.${cls} w=${Math.round(r.width)}`);
      }
      if (wide.length >= 8) break;
    }
    // tap targets
    const smallTap = [];
    const interactive = document.querySelectorAll("a, button, [role='button'], input, select, textarea, [onclick]");
    for (const el of interactive) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 40 || r.height < 40) {
        const cls = (el.className && el.className.toString ? el.className.toString() : "").slice(0, 60);
        smallTap.push(`${el.tagName} ${Math.round(r.width)}x${Math.round(r.height)} ${cls}`);
      }
      if (smallTap.length >= 10) break;
    }
    // text below 11px
    let tinyText = 0;
    for (const el of document.querySelectorAll("p, span, li, td, label, h1,h2,h3,h4,h5,h6, button, a, div")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs > 0 && fs < 11) tinyText++;
      if (tinyText > 15) break;
    }
    // fixed/sticky covering full width
    const fixedEls = [...document.querySelectorAll("*")]
      .filter((el) => { const p = getComputedStyle(el).position; return p === "fixed" || p === "sticky"; })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.tagName}.${(el.className || "").toString().slice(0, 40)} ${getComputedStyle(el).position} y=${Math.round(r.top)}-${Math.round(r.bottom)}`;
      })
      .slice(0, 6);
    const title = document.title;
    const h1 = document.querySelector("h1")?.textContent?.trim().slice(0, 60) || "";
    return { overflowX, vw, wide, smallTap, tinyText, fixedEls, title, h1 };
  });
  const shot = `${OUT}/${vp.name}${path.replace(/\//g, "_") || "_root"}.png`;
  await page.screenshot({ path: shot, fullPage: vp.name !== "desktop" }).catch(() => {});
  page.off("console", onConsole);
  return { path, vp: vp.name, status, ...audit, errors: errors.slice(0, 5) };
}

// 1. public pages on all viewports
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  for (const p of PUBLIC_PAGES) {
    results.push(await auditPage(page, p, vp));
  }
  await ctx.close();
}

// 2. signup + real form login to unlock dashboard (supabase client-side auth)
let authed = false;
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const email = `uiaudit.${Date.now()}@example.com`;
  try {
    await page.goto(BASE + "/register", { waitUntil: "networkidle" });
    await page.fill("input[type=text]", "UI Audit");
    await page.fill("input[type=email]", email);
    await page.fill("input[type=password]", "AuditPass123!");
    await page.click("button[type=submit]");
    await page.waitForURL(/discover|find|today/, { timeout: 25000 });
    console.log("REGISTER OK ->", page.url());
    authed = true;
  } catch (e) {
    console.log("AUTH FAILED:", e.message.slice(0, 300));
  }
  if (authed) {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const list = vp.name === "desktop" ? DASH_PAGES
        : ["/find", "/today", "/swipe", "/best-buy", "/deal-check", "/alerts", "/settings"];
      for (const dp of list) {
        results.push(await auditPage(page, dp, vp));
      }
    }
  }
  await ctx.close();
}

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
// print compact summary of problems only
for (const r of results) {
  const probs = [];
  if (r.status >= 400) probs.push(`HTTP ${r.status}`);
  if (r.overflowX > 1) probs.push(`overflow-x ${r.overflowX}px`);
  if (r.wide?.length) probs.push(`wide: ${r.wide.join(" | ")}`);
  if (r.smallTap?.length) probs.push(`smallTap(${r.smallTap.length}): ${r.smallTap.slice(0, 4).join(" | ")}`);
  if (r.tinyText > 3) probs.push(`tinyText ${r.tinyText}`);
  if (r.errors?.length) probs.push(`console: ${r.errors.join(" || ").slice(0, 250)}`);
  if (probs.length) {
    console.log(`\n[${r.vp}] ${r.path}`);
    for (const p of probs) console.log("   - " + p);
  }
}
console.log("\nDONE. report:", `${OUT}/report.json`);
await browser.close();
