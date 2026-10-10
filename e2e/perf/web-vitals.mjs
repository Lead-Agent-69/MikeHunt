#!/usr/bin/env node
// LCP / CLS / INP sampler (PerformanceObserver; same definitions as the web-vitals library:
// LCP = last largest-contentful-paint before first input, CLS = max session-window sum of layout
// shifts without recent input, INP = worst event-timing duration per interactionId across the
// scripted interactions). Sequential, read-only: interactions only type/click non-submit controls.
//
//   node e2e/perf/web-vitals.mjs --base https://mikehunt-69.vercel.app --set guest --runs 3 --out prod-vitals.json
//   node e2e/perf/web-vitals.mjs --base http://127.0.0.1:3100 --set local --storage e2e/.auth/personal.json
import { writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://127.0.0.1:3000");
const RUNS = Number(arg("runs", "3"));
const SET = arg("set", "guest");
const OUT = arg("out", "");
const STORAGE = arg("storage", "");
const FLIP_STORAGE = arg("flip-storage", "");
const DEAL = arg("deal", "");
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE);

// Each interaction is a non-submitting control so it is safe on prod.
const GUEST = [
  {
    path: "/",
    act: async (p) => {
      await p.mouse.wheel(0, 600);
      await p
        .locator("summary, button:not([type=submit])")
        .filter({ visible: true })
        .first()
        .click({ trial: false })
        .catch(() => {});
    },
  },
  {
    path: "/login",
    act: async (p) => {
      await p.locator('input[type="email"]').click();
      await p.keyboard.type("perf@example.com", { delay: 30 });
    },
  },
  {
    path: "/register",
    act: async (p) => {
      await p.getByPlaceholder("John Doe").click();
      await p.keyboard.type("Perf Probe", { delay: 30 });
    },
  },
  {
    path: "/scan",
    act: async (p) => {
      await p
        .getByRole("button", { name: /Filters/ })
        .first()
        .click()
        .catch(() => {});
    },
  },
  {
    path: "/tools",
    act: async (p) => {
      await p.mouse.wheel(0, 800);
      await p
        .locator("button:not([type=submit])")
        .filter({ visible: true })
        .first()
        .click()
        .catch(() => {});
    },
  },
  {
    path: "/dealer-network",
    act: async (p) => {
      await p
        .locator("input")
        .filter({ visible: true })
        .first()
        .click()
        .catch(() => {});
      await p.keyboard.type("ford", { delay: 30 });
    },
  },
];
const SIGNED_IN = [
  {
    path: "/discover",
    act: async (p) => {
      await p
        .getByRole("button", { name: /Salvage & repairable/ })
        .first()
        .click()
        .catch(() => {});
    },
  },
  {
    path: "/scan",
    act: async (p) => {
      await p
        .getByRole("button", { name: /Filters/ })
        .first()
        .click()
        .catch(() => {});
      await p.mouse.wheel(0, 2000);
    },
  },
  {
    path: "/map",
    act: async (p) => {
      await p
        .locator(".leaflet-control-zoom-in")
        .first()
        .click()
        .catch(() => {});
    },
  },
  {
    path: "/flash-deals",
    act: async (p) => {
      await p.mouse.wheel(0, 600);
    },
  },
  {
    path: "/saved",
    act: async (p) => {
      await p
        .getByRole("button", { name: /Price drops/ })
        .first()
        .click()
        .catch(() => {});
    },
  },
  {
    path: "/alerts",
    act: async (p) => {
      await p.mouse.wheel(0, 400);
    },
  },
  {
    path: "/settings",
    act: async (p) => {
      await p
        .locator("select")
        .first()
        .selectOption({ index: 3 })
        .catch(() => {});
    },
  },
  ...(DEAL
    ? [
        {
          path: `/deal/${DEAL}`,
          act: async (p) => {
            await p
              .getByText("Compare price and timing")
              .first()
              .click()
              .catch(() => {});
          },
        },
      ]
    : []),
];
const FLIP = [
  {
    path: "/find",
    act: async (p) => {
      await p.getByLabel("Make", { exact: true }).click();
      await p.keyboard.type("Honda", { delay: 30 });
    },
  },
];

const OBSERVER = () => {
  const w = window;
  w.__v = { lcp: 0, lcpEl: "", cls: 0, inp: 0, events: {} };
  let sess = 0,
    sessStart = 0,
    sessLast = 0;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      w.__v.lcp = e.startTime;
      w.__v.lcpEl =
        (e.element &&
          e.element.tagName +
            (e.element.className
              ? "." + String(e.element.className).split(" ")[0]
              : "")) ||
        e.url ||
        "";
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      if (
        sess &&
        (e.startTime - sessLast > 1000 || e.startTime - sessStart > 5000)
      )
        sess = 0;
      if (!sess) sessStart = e.startTime;
      sess += e.value;
      sessLast = e.startTime;
      w.__v.cls = Math.max(w.__v.cls, sess);
    }
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (!e.interactionId) continue;
      const d = e.duration;
      w.__v.events[e.interactionId] = Math.max(
        w.__v.events[e.interactionId] || 0,
        d,
      );
      w.__v.inp = Math.max(w.__v.inp, d);
    }
  }).observe({ type: "event", buffered: true, durationThreshold: 16 });
};

async function measure(_unused, page0, viewport, storage) {
  // A fresh browser per sample: isolates crashes and keeps runs independent (cold cache, like a first visit).
  const browser = await chromium.launch({
    executablePath: process.env.E2E_CHROME || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: viewport.width < 500 ? 3 : 1,
      isMobile: viewport.width < 500,
      hasTouch: viewport.width < 500,
      ...(storage && existsSync(storage) ? { storageState: storage } : {}),
    });
    const page = await ctx.newPage();
    await page.addInitScript(OBSERVER);
    if (viewport.width < 500) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
    const t0 = Date.now();
    const resp = await page
      .goto(BASE + page0.path, { waitUntil: "load", timeout: 45000 })
      .catch((e) => ({ status: () => 0, err: e }));
    await page.waitForTimeout(3000);
    const loadMs = Date.now() - t0;
    const pre = await page.evaluate(() => ({
      lcp: window.__v.lcp,
      lcpEl: window.__v.lcpEl,
      cls: window.__v.cls,
    }));
    try {
      await page0.act(page);
    } catch {}
    await page.waitForTimeout(1500);
    const post = await page.evaluate(() => ({
      cls: window.__v.cls,
      inp: window.__v.inp,
      interactions: Object.keys(window.__v.events).length,
      dom: document.getElementsByTagName("*").length,
      heapMB: performance.memory
        ? performance.memory.usedJSHeapSize / 1048576
        : null,
    }));
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      const r = performance.getEntriesByType("resource");
      const js = r.filter(
        (x) => x.initiatorType === "script" || /\.js(\?|$)/.test(x.name),
      );
      return {
        ttfb: n ? n.responseStart : null,
        domContentLoaded: n ? n.domContentLoadedEventEnd : null,
        jsKB: js.reduce((s, x) => s + (x.transferSize || 0), 0) / 1024,
        jsDecodedKB:
          js.reduce((s, x) => s + (x.decodedBodySize || 0), 0) / 1024,
        requests: r.length,
      };
    });
    const out = {
      path: page0.path,
      viewport: `${viewport.width}x${viewport.height}`,
      status: resp?.status?.() ?? 0,
      finalUrl: page.url().replace(BASE, ""),
      lcpMs: Math.round(pre.lcp),
      lcpEl: pre.lcpEl,
      cls: Number(post.cls.toFixed(3)),
      inpMs: Math.round(post.inp),
      interactions: post.interactions,
      ttfbMs: Math.round(nav.ttfb || 0),
      dclMs: Math.round(nav.domContentLoaded || 0),
      jsTransferKB: Math.round(nav.jsKB),
      jsDecodedKB: Math.round(nav.jsDecodedKB),
      requests: nav.requests,
      domNodes: post.dom,
      heapMB: post.heapMB && Number(post.heapMB.toFixed(1)),
      loadMs,
    };
    await ctx.close();
    return out;
  } finally {
    await browser.close().catch(() => {});
  }
}

const med = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
const browser = null;
const plan = [];
if (SET === "guest" || SET === "all")
  for (const p of GUEST) plan.push([p, null]);
if (SET === "local" || SET === "all") {
  if (!IS_LOCAL) throw new Error("signed-in vitals are local-only");
  for (const p of SIGNED_IN) plan.push([p, STORAGE]);
  for (const p of FLIP) plan.push([p, FLIP_STORAGE || STORAGE]);
}
const rows = [];
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  for (const [p, storage] of plan) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      try {
        runs.push(await measure(browser, p, viewport, storage));
      } catch (e) {
        console.log(
          `  ! ${p.path} ${viewport.width}: ${String(e.message || e).split("\n")[0]}`,
        );
      }
      if (!IS_LOCAL) await new Promise((r) => setTimeout(r, 1500));
    }
    if (!runs.length) continue;
    const pick = (k) => med(runs.map((r) => r[k]));
    const row = {
      path: p.path,
      viewport: runs[0].viewport,
      status: runs[0].status,
      finalUrl: runs[0].finalUrl,
      lcpMs: pick("lcpMs"),
      cls: pick("cls"),
      inpMs: pick("inpMs"),
      ttfbMs: pick("ttfbMs"),
      jsTransferKB: pick("jsTransferKB"),
      jsDecodedKB: pick("jsDecodedKB"),
      domNodes: pick("domNodes"),
      heapMB: pick("heapMB"),
      lcpEl: runs[0].lcpEl,
      runs,
    };
    rows.push(row);
    console.log(
      `${row.viewport.padEnd(9)} ${p.path.slice(0, 22).padEnd(22)} ${String(row.status).padEnd(4)} LCP ${String(row.lcpMs).padStart(5)}ms CLS ${String(row.cls).padEnd(5)} INP ${String(row.inpMs).padStart(4)}ms TTFB ${String(row.ttfbMs).padStart(4)}ms JS ${row.jsTransferKB}KB (${row.jsDecodedKB}KB raw) DOM ${row.domNodes} heap ${row.heapMB}MB lcpEl ${row.lcpEl}`,
    );
  }
}
if (OUT)
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        base: BASE,
        set: SET,
        runs: RUNS,
        at: new Date().toISOString(),
        note: "390px runs use 4x CPU throttle, no network throttle; median of runs",
        rows,
      },
      null,
      2,
    ),
  );
