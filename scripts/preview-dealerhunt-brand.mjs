import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = process.cwd();
const out = path.join(root, "test-results/dh-brand-review");
// Keep compiled third-party preview code out of the repository's source lint.
const bundleDir = path.join(root, ".cache/dh-brand-preview");
await fs.mkdir(out, { recursive: true });
await fs.mkdir(bundleDir, { recursive: true });
await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {MikeHuntLogo} from './components/brand/MikeHuntLogo'; import {MikeHuntLoader} from './components/brand/MikeHuntLoader'; function Review(){const [pending,setPending]=React.useState("loading"); React.useEffect(()=>{(window.reviewSetters??=[]).push(setPending);},[]);return (<><div className="logos">{(['sm','md','lg'] as const).map(size=><MikeHuntLogo key={size} size={size}/>)}</div><div className="states">{(['idle','loading','complete','error'] as const).map(state=><figure key={state}><MikeHuntLoader state={state === "loading" ? pending : state} size={80} label="Checking vehicle"/><figcaption>{state}</figcaption></figure>)}</div><div className="states">{[20,32,48,64].map(size=><figure key={size}><MikeHuntLoader state={pending} size={size} label="Checking vehicle"/><figcaption>{size}px</figcaption></figure>)}</div></>)}; window.setReviewPending=next=>flushSync(()=>window.reviewSetters.forEach(set=>set(next))); window.mountReview=()=>document.querySelectorAll("[data-review-root]").forEach(el=>createRoot(el).render(<Review/>));`,
    resolveDir: root,
    loader: "tsx",
  },
  outfile: path.join(bundleDir, "components.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  alias: { "@": root },
  loader: { ".module.css": "local-css" },
});
const original = (await fs.readFile(process.argv[2])).toString("base64");
const before = Buffer.from(
  execFileSync("git", ["show", "HEAD:public/brand/DEALERHUNT-D.svg"], {
    cwd: root,
  }),
).toString("base64");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>DealerHunt branding review only</title><link rel="stylesheet" href="/components.css"><style>
*{box-sizing:border-box}body{margin:0;font:14px system-ui;background:#e8edf5;color:#162236;padding:28px}h1{font-size:23px;margin:0 0 8px}p{margin:0 0 20px;color:#536477}.compare{display:flex;gap:20px;margin-bottom:24px}.compare figure{margin:0;background:white;border-radius:14px;padding:16px;flex:1;text-align:center}.compare img{width:100%;height:170px;object-fit:contain}.compare .original{background:#000}.compare .original img{object-fit:cover;object-position:center;width:230px;height:170px}.compare .original figcaption{color:white}.theme{border-radius:16px;padding:24px;background:#f6f8fb;--t1:#14213a;color:var(--t1);margin-top:18px}.theme[data-theme=dark]{background:#050b18;--t1:#f4f7fc}.logos{display:flex;align-items:center;gap:36px;min-height:64px}.states{display:flex;align-items:center;gap:34px;margin-top:20px}figure{margin:0}figcaption{font-size:12px;opacity:.75;margin-top:10px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}.inline-flex{display:inline-flex}.items-center{align-items:center}.justify-center{justify-content:center}.shrink-0{flex-shrink:0}.gap-2\\.5{gap:10px}.h-8{height:32px}.w-8{width:32px}.h-10{height:40px}.w-10{width:40px}.h-14{height:56px}.w-14{width:56px}.h-full{height:100%}.w-full{width:100%}.object-contain{object-fit:contain}.font-black{font-weight:900}.uppercase{text-transform:uppercase}.leading-none{line-height:1}.whitespace-nowrap{white-space:nowrap}.text-xl{font-size:20px}.text-2xl{font-size:24px}.text-\\[17px\\]{font-size:17px}h2{font-size:15px;margin:0 0 16px}.icons{display:flex;gap:20px;align-items:center;margin-top:18px}.icons img{object-fit:contain}
</style></head><body><h1>DealerHunt — branding review only</h1><p>Original pixels extracted; HUD motion indicates pending work only. No merge or deployment.</p><div class="compare"><figure><img src="data:image/svg+xml;base64,${before}"><figcaption>Existing simplified arrow</figcaption></figure><figure class="original"><img src="data:image/png;base64,${original}"><figcaption>Approved original artwork</figcaption></figure><figure><img src="/brand/DEALERHUNT-D.svg"><figcaption>Extracted original H and gradient</figcaption></figure></div>${["light", "dark"].map((theme) => `<section class="theme" data-theme="${theme}"><h2>${theme} · shared logo and loader</h2><div data-review-root></div></section>`).join("")}<div class="icons">${[16, 32, 96].map((size) => `<img width="${size}" height="${size}" src="/icon-96x96.png">`).join("")}<span>Web / PWA icon</span></div><script src="/components.js"></script></body></html>`;
await fs.writeFile(path.join(out, "preview.html"), html);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const relative = decodeURIComponent(url.pathname).replace(/^\//, "");
    const file =
      relative === ""
        ? path.join(out, "preview.html")
        : ["components.css", "components.js"].includes(relative)
          ? path.join(bundleDir, relative)
          : path.join(root, "public", relative);
    if (!file.startsWith(root + path.sep)) throw Error("outside workspace");
    const data = await fs.readFile(file);
    res.setHeader(
      "Content-Type",
      file.endsWith(".html")
        ? "text/html"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".js")
            ? "text/javascript"
            : file.endsWith(".svg")
              ? "image/svg+xml"
              : file.endsWith(".png")
                ? "image/png"
                : "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1150, height: 1120 },
    deviceScaleFactor: 1,
    recordVideo: { dir: out, size: { width: 1150, height: 1120 } },
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page
    .locator("img")
    .evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
  await page.clock.install({ time: new Date("2026-11-05T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-05T12:00:01Z"));
  await page.evaluate(() => window.mountReview());
  await page.waitForFunction(
    () => document.querySelectorAll("[data-state]").length === 16,
  );
  const pendingArt = '[data-state="loading"] > span[aria-hidden="true"]';
  const hiddenBefore = await page
    .locator(pendingArt)
    .evaluateAll((els) =>
      els.every((el) => getComputedStyle(el).display === "none"),
    );
  if (!hiddenBefore) throw Error("Initial artwork flashed");
  await page.clock.runFor(199);
  const hiddenAt199 = await page
    .locator(pendingArt)
    .evaluateAll((els) =>
      els.every((el) => getComputedStyle(el).display === "none"),
    );
  if (!hiddenAt199) throw Error("Artwork appeared before 200ms");
  await page.screenshot({
    path: path.join(out, "branding-before-200ms.png"),
    fullPage: true,
  });
  await page.clock.runFor(1);
  const compact = await page.locator(pendingArt).evaluateAll((els) =>
    els.map((el) => ({
      width: el.getBoundingClientRect().width,
      hidden: el.hidden,
    })),
  );
  if (compact.some((el) => el.hidden || el.width > 32))
    throw Error("Short wait is not compact");
  await page.screenshot({
    path: path.join(out, "branding-compact-200ms.png"),
    fullPage: true,
  });
  await page.clock.runFor(800);
  await page.screenshot({
    path: path.join(out, "branding-review.png"),
    fullPage: true,
  });
  const motion = await page.evaluate(() =>
    [...document.querySelectorAll("[data-state]")].map((el) => ({
      state: el.dataset.state,
      animations: el.getAnimations({ subtree: true }).map((a) => a.playState),
      ringOpacity: getComputedStyle(el.querySelector("svg")).opacity,
      visualWidth: el
        .querySelector('span[aria-hidden="true"]')
        .getBoundingClientRect().width,
    })),
  );
  if (
    motion.some((el) =>
      el.state === "loading"
        ? el.animations.length !== 4 || el.ringOpacity !== "1"
        : el.animations.length !== 0 || el.ringOpacity !== "0",
    )
  )
    throw Error("Incorrect request-state motion");
  const phases = [];
  for (const [name, time] of [
    ["scan", 600],
    ["discover", 1800],
    ["evaluate", 3000],
    ["reveal", 4200],
  ]) {
    const phase = await page.evaluate(
      ({ name, time }) => {
        const pending = [
          ...document.querySelectorAll('[data-state="loading"]'),
        ];
        pending.forEach((el) =>
          el.getAnimations({ subtree: true }).forEach((animation) => {
            animation.pause();
            animation.currentTime = time;
          }),
        );
        const sample = pending[0];
        return {
          name,
          time,
          taskText: sample.textContent,
          state: sample.dataset.state,
          scanOpacity: getComputedStyle(
            sample.querySelector('[data-motion="scan"]'),
          ).opacity,
          discoverOpacity: getComputedStyle(
            sample.querySelector('[data-motion="discover"]'),
          ).opacity,
          evaluateOpacity: getComputedStyle(
            sample.querySelector('[data-motion="evaluate"]'),
          ).opacity,
          revealFilter: getComputedStyle(
            sample.querySelector('[data-motion="reveal"]'),
          ).filter,
        };
      },
      { name, time },
    );
    if (phase.taskText !== "Checking vehicle" || phase.state !== "loading")
      throw Error("Motion invented request progress");
    if (name === "scan" && phase.scanOpacity !== "1")
      throw Error("Missing scan beat");
    if (name === "discover" && Number(phase.discoverOpacity) < 0.6)
      throw Error("Missing discovery sweep");
    if (name === "evaluate" && Number(phase.evaluateOpacity) < 0.7)
      throw Error("Missing evaluation brackets");
    if (name === "reveal" && phase.revealFilter === "none")
      throw Error("Missing reveal glow");
    await page.screenshot({
      path: path.join(out, `branding-phase-${name}.png`),
      fullPage: true,
    });
    // Actual settlement interrupts any decorative beat immediately.
    await page.evaluate(() => window.setReviewPending("complete"));
    await page.waitForFunction(
      () => !document.querySelector('[data-state="loading"]'),
    );
    if ((await page.evaluate(() => document.getAnimations().length)) !== 0)
      throw Error("Motion continued after settlement");
    phase.interruptedOnSettlement = true;
    phases.push(phase);
    await page.evaluate(() => window.setReviewPending("loading"));
    await page.waitForFunction(
      () => !!document.querySelector('[data-state="loading"]'),
    );
    await page.clock.runFor(1000);
  }
  // Capture a real-time cycle in the recording, in addition to deterministic beat snapshots.
  await page.clock.resume();
  await page.waitForTimeout(5000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await page.evaluate(() => document.getAnimations().length);
  if (reduced !== 0) throw Error("Reduced motion is not static");
  await page.screenshot({
    path: path.join(out, "branding-reduced-motion.png"),
    fullPage: true,
  });
  await fs.writeFile(
    path.join(out, "browser-checks.json"),
    JSON.stringify(
      {
        hiddenBefore,
        hiddenAt199,
        compact,
        motion,
        phases,
        reducedMotionAnimations: reduced,
      },
      null,
      2,
    ),
  );
  const video = page.video();
  await context.close();
  await video.saveAs(path.join(out, "branding-motion.webm"));
  console.log(
    JSON.stringify({
      out,
      motionChecks: motion.length,
      reducedMotionAnimations: reduced,
    }),
  );
} finally {
  await browser.close();
  server.close();
}
