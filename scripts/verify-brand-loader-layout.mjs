// Browser regression for the actual shared component/CSS, without a backend.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = process.cwd();
const out = path.join(root, "test-results/dh-loader-stability");
const bundle = path.join(root, ".cache/dh-loader-stability");
await fs.mkdir(out, { recursive: true });
await fs.mkdir(bundle, { recursive: true });
await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {MikeHuntLoader} from './components/brand/MikeHuntLoader';
    const root=createRoot(document.getElementById('probe'));
    window.renderLoader=(state='loading',size=64,motion='animated')=>flushSync(()=>root.render(<><MikeHuntLoader state={state} size={size} motion={motion} label="Loading workspace"/><span id="neighbor">Adjacent content</span></>));
    window.unmountLoader=()=>flushSync(()=>root.render(null));`,
    loader: "tsx",
    resolveDir: root,
  },
  outfile: path.join(bundle, "probe.js"),
  bundle: true,
  platform: "browser",
  jsx: "automatic",
  alias: { "@": root },
  loader: { ".module.css": "local-css" },
});
const server = http.createServer(async (req, res) => {
  const files = {
    "/probe.js": [path.join(bundle, "probe.js"), "text/javascript"],
    "/probe.css": [path.join(bundle, "probe.css"), "text/css"],
    "/brand/DEALERHUNT-D.svg": [
      path.join(root, "public/brand/DEALERHUNT-D.svg"),
      "image/svg+xml",
    ],
  };
  if (req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<!doctype html><html><head><link rel="stylesheet" href="/probe.css"><style>body{font:16px system-ui;background:#f6f8fb;padding:40px}#probe{display:flex;align-items:center;width:40px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}#neighbor{flex-shrink:0;margin-left:16px}</style></head><body><h1>Shared loader layout regression</h1><div id="probe"></div><script src="/probe.js"></script></body></html>`,
    );
  } else if (files[req.url]) {
    res.setHeader("Content-Type", files[req.url][1]);
    res.end(await fs.readFile(files[req.url][0]));
  } else {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const checks = {};
async function inspect(page) {
  return page.evaluate(() => {
    const status = document.querySelector('[role="status"]');
    const visual = status?.querySelector('span[aria-hidden="true"]');
    const box = (node) => {
      const rect = node?.getBoundingClientRect();
      return rect
        ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        : null;
    };
    const animations = document.getAnimations();
    return {
      root: box(status),
      neighbor: box(document.querySelector("#neighbor")),
      visual: box(visual),
      hidden: visual?.hidden,
      text: status?.textContent,
      state: status?.dataset.state,
      animations: animations.length,
      animatedProperties: [
        ...new Set(
          animations.flatMap((a) =>
            a.effect
              .getKeyframes()
              .flatMap((frame) =>
                Object.keys(frame).filter(
                  (key) =>
                    ![
                      "offset",
                      "computedOffset",
                      "easing",
                      "composite",
                    ].includes(key),
                ),
              ),
          ),
        ),
      ],
      filter: status
        ? [...status.querySelectorAll("*")].map(
            (e) => getComputedStyle(e).filter,
          )
        : [],
    };
  });
}
const sameLayout = (actual, expected, size) => {
  assert.deepEqual(actual.root, expected.root);
  assert.deepEqual(actual.neighbor, expected.neighbor);
  assert.equal(actual.root.width, size);
  assert.equal(actual.root.height, size);
};
const centered = (state, size) => {
  assert.equal(state.visual.width, size);
  assert.equal(state.visual.height, size);
  assert.equal(state.visual.x + size / 2, state.root.x + state.root.width / 2);
  assert.equal(state.visual.y + size / 2, state.root.y + state.root.height / 2);
};
try {
  const context = await browser.newContext({
    viewport: { width: 720, height: 300 },
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.clock.install({ time: new Date("2026-11-05T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-05T12:00:01Z"));
  for (const size of [20, 48, 64, 96]) {
    await page.evaluate((size) => window.renderLoader("loading", size), size);
    const initial = await inspect(page);
    assert.equal(initial.hidden, true);
    assert.equal(initial.text, "Loading workspace");
    assert.equal(initial.animations, 0);
    await page.clock.runFor(199);
    const short = await inspect(page);
    sameLayout(short, initial, size);
    assert.equal(short.hidden, true);
    await page.clock.runFor(1);
    const compact = await inspect(page);
    sameLayout(compact, initial, size);
    centered(compact, Math.min(size, 32));
    assert.equal(compact.animations, 4);
    assert.deepEqual(compact.animatedProperties.sort(), [
      "opacity",
      "transform",
    ]);
    assert.ok(compact.filter.every((value) => value === "none"));
    await page.clock.runFor(800);
    const full = await inspect(page);
    sameLayout(full, initial, size);
    centered(full, size);
    if (size === 64)
      await page.screenshot({ path: path.join(out, "full.png") });
    const settled = {};
    for (const state of ["idle", "complete", "error"]) {
      await page.evaluate(
        ({ state, size }) => window.renderLoader(state, size),
        { state, size },
      );
      settled[state] = await inspect(page);
      sameLayout(settled[state], initial, size);
      assert.equal(settled[state].animations, 0);
      centered(settled[state], size);
    }
    checks[size] = { initial, short, compact, full, settled };
    await page.evaluate(() => window.unmountLoader());
  }
  await page.evaluate(() => window.renderLoader());
  await page.clock.runFor(100);
  assert.equal((await inspect(page)).hidden, true);
  await page.evaluate(() => window.unmountLoader());
  await page.clock.runFor(1000);
  checks.fastUnmount = await inspect(page);
  assert.equal(checks.fastUnmount.root, null);
  assert.equal(checks.fastUnmount.animations, 0);
  for (const mode of ["reduced", "prop", "data-motion", "data-app-motion"]) {
    await page.emulateMedia({
      reducedMotion: mode === "reduced" ? "reduce" : "no-preference",
    });
    if (mode.startsWith("data-"))
      await page.evaluate(
        (attr) => document.documentElement.setAttribute(attr, "static"),
        mode,
      );
    await page.evaluate(
      (mode) =>
        window.renderLoader(
          "loading",
          64,
          mode === "prop" ? "static" : "animated",
        ),
      mode,
    );
    await page.clock.runFor(1000);
    const result = await inspect(page);
    assert.equal(result.animations, 0);
    assert.equal(result.state, "loading");
    assert.equal(result.text, "Loading workspace");
    assert.equal(result.root.width, 64);
    assert.equal(result.root.height, 64);
    checks[mode] = result;
    if (mode === "reduced")
      await page.screenshot({ path: path.join(out, "reduced-motion.png") });
    if (mode.startsWith("data-"))
      await page.evaluate(
        (attr) => document.documentElement.removeAttribute(attr),
        mode,
      );
    await page.evaluate(() => window.unmountLoader());
  }
  await fs.writeFile(
    path.join(out, "browser-checks.json"),
    JSON.stringify(checks, null, 2),
  );
  console.log(
    JSON.stringify({
      passed: true,
      evidence: path.join(out, "browser-checks.json"),
    }),
  );
  await context.close();
} finally {
  await browser.close();
  server.close();
}
