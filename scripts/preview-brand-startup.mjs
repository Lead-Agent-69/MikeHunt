import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = process.cwd();
const out = path.join(root, "test-results/dh-brand-review");
const bundleDir = path.join(root, ".cache/dh-brand-startup");
await fs.mkdir(out, { recursive: true });
await fs.mkdir(bundleDir, { recursive: true });
await build({
  stdin: {
    contents: `import React,{Suspense,Component} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import DashboardLoading from './app/(dashboard)/loading';
    const root=createRoot(document.getElementById('review'));let ready=false,failed=false,pending,resolve;
    function Content(){if(failed)throw new Error('Route failed');if(!ready)throw pending;return <button>Usable workspace</button>}
    class ErrorRoute extends Component {state={error:false};static getDerivedStateFromError(){return {error:true}}render(){return this.state.error?<p role="alert">Workspace unavailable</p>:this.props.children}}
    function App(){return <><header><a href="/">Workspace navigation</a></header><main><ErrorRoute><Suspense fallback={<DashboardLoading/>}><Content/></Suspense></ErrorRoute></main></>}
    window.mountReview=()=>{ready=false;failed=false;pending=new Promise(done=>resolve=done);flushSync(()=>root.render(<App/>))};
    window.remountReview=()=>{flushSync(()=>root.render(null));window.mountReview()};
    window.readyReview=()=>{ready=true;resolve();flushSync(()=>root.render(<App/>))};
    window.failReview=()=>{failed=true;resolve();flushSync(()=>root.render(<App/>))};`,
    loader: "tsx",
    resolveDir: root,
  },
  outfile: path.join(bundleDir, "components.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  alias: { "@": root },
  loader: { ".module.css": "local-css" },
});
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/components.css"><style>body{margin:0;background:#f6f8fb;font:15px system-ui;color:#14213a;--t3:#536477}#review{max-width:640px;margin:40px auto;border:1px solid #dce3ed;border-radius:12px;background:#fff}header{padding:20px;border-bottom:1px solid #dce3ed}a{color:#075be8}main{min-height:180px;padding:20px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}button{padding:12px}</style></head><body><div id="review"></div><script src="/components.js"></script></body></html>`;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(html);
      return;
    }
    const file =
      url.pathname === "/components.js" || url.pathname === "/components.css"
        ? path.join(bundleDir, url.pathname.slice(1))
        : url.pathname === "/brand/DEALERHUNT-D.svg"
          ? path.join(root, "public/brand/DEALERHUNT-D.svg")
          : null;
    if (!file) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "image/svg+xml",
    );
    res.end(await fs.readFile(file));
  } catch {
    res.statusCode = 500;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const checks = {};
async function fresh({
  reducedMotion = "no-preference",
  blockedStorage = false,
  record = false,
} = {}) {
  const context = await browser.newContext({
    viewport: { width: 900, height: 440 },
    reducedMotion,
    ...(record
      ? { recordVideo: { dir: out, size: { width: 900, height: 440 } } }
      : {}),
  });
  if (blockedStorage)
    await context.addInitScript(() =>
      Object.defineProperty(window, "sessionStorage", {
        get() {
          throw new DOMException("Blocked", "SecurityError");
        },
      }),
    );
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.clock.install({ time: new Date("2026-11-05T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-05T12:00:01Z"));
  return { context, page };
}
async function inspect(page) {
  return page.evaluate(() => {
    const status = document.querySelector('[role="status"]');
    const slot = status?.parentElement.getBoundingClientRect();
    return {
      statusCount: document.querySelectorAll('[role="status"]').length,
      text: status?.textContent,
      state: status?.getAttribute("data-state"),
      motion: status?.getAttribute("data-motion"),
      hidden: status?.querySelector('span[aria-hidden="true"]').hidden,
      animations: document.getAnimations().length,
      slot: slot ? { width: slot.width, height: slot.height } : null,
      navigationPresent: !!document.querySelector("header a"),
    };
  });
}
function assert(condition, message) {
  if (!condition) throw Error(message);
}
try {
  const { context, page } = await fresh({ record: true });
  await page.evaluate(() => window.mountReview());
  await page.clock.runFor(199);
  const hidden = await inspect(page);
  assert(
    hidden.hidden &&
      hidden.animations === 0 &&
      hidden.slot.width === 64 &&
      hidden.slot.height === 64,
    "Anti-flash/reservation failed",
  );
  await page.clock.runFor(1);
  const animated = await inspect(page);
  assert(
    animated.animations === 4 &&
      animated.navigationPresent &&
      animated.text === "Loading workspace",
    "First fallback did not animate neutrally",
  );
  await page.screenshot({ path: path.join(out, "startup-pending-200ms.png") });
  await page.evaluate(
    () => (document.documentElement.dataset.appMotion = "static"),
  );
  assert(
    (await inspect(page)).animations === 0,
    "Live static app setting ignored",
  );
  await page.evaluate(() => delete document.documentElement.dataset.appMotion);
  await page.clock.runFor(1099);
  assert(
    (await inspect(page)).motion === "animated",
    "Animation capped too early",
  );
  await page.clock.runFor(1);
  const capped = await inspect(page);
  assert(
    capped.motion === "static" &&
      capped.animations === 0 &&
      capped.state === "loading" &&
      capped.text === "Loading workspace" &&
      capped.slot.width === 64 &&
      capped.slot.height === 64,
    "1300ms cap invented completion or failed",
  );
  await page.screenshot({ path: path.join(out, "startup-capped-1300ms.png") });
  await page.evaluate(() => window.remountReview());
  await page.clock.runFor(200);
  const repeat = await inspect(page);
  assert(
    repeat.motion === "static" && repeat.animations === 0,
    "Repeat mounted animated",
  );
  await page.reload();
  await page.evaluate(() => window.mountReview());
  await page.clock.runFor(200);
  const reload = await inspect(page);
  assert(
    reload.motion === "static" && reload.animations === 0,
    "Session storage did not survive reload",
  );
  checks.timing = {
    hiddenAt199ms: hidden,
    animatedAt200ms: animated,
    cappedAt1300ms: capped,
    repeatMount: repeat,
    repeatDocument: reload,
  };
  const video = page.video();
  await context.close();
  await video.saveAs(path.join(out, "startup-motion.webm"));

  const fast = await fresh();
  await fast.page.evaluate(() => window.mountReview());
  await fast.page.clock.runFor(100);
  await fast.page.evaluate(() => window.readyReview());
  const ready = await inspect(fast.page);
  assert(
    ready.statusCount === 0 &&
      ready.animations === 0 &&
      (await fast.page
        .getByRole("button", { name: "Usable workspace" })
        .count()) === 1,
    "Fast content did not replace fallback",
  );
  checks.fastReady = ready;
  await fast.context.close();

  const failure = await fresh();
  await failure.page.evaluate(() => window.mountReview());
  await failure.page.clock.runFor(300);
  await failure.page.evaluate(() => window.failReview());
  const failed = await inspect(failure.page);
  assert(
    failed.statusCount === 0 &&
      failed.animations === 0 &&
      (await failure.page.getByRole("alert").count()) === 1,
    "Error route did not replace fallback",
  );
  checks.errorRoute = failed;
  await failure.context.close();

  const storage = await fresh({ blockedStorage: true });
  await storage.page.evaluate(() => window.mountReview());
  await storage.page.clock.runFor(200);
  const first = await inspect(storage.page);
  assert(first.animations === 4, "Blocked storage failed first fallback");
  await storage.page.evaluate(() => window.remountReview());
  await storage.page.clock.runFor(200);
  const second = await inspect(storage.page);
  assert(
    second.motion === "static" && second.animations === 0,
    "Blocked storage replayed animation",
  );
  checks.blockedStorage = { first, repeat: second };
  await storage.context.close();

  for (const mode of ["reduced", "data-motion", "data-app-motion"]) {
    const probe = await fresh({
      reducedMotion: mode === "reduced" ? "reduce" : "no-preference",
    });
    if (mode !== "reduced")
      await probe.page.evaluate(
        (attr) => document.documentElement.setAttribute(attr, "static"),
        mode,
      );
    await probe.page.evaluate(() => window.mountReview());
    await probe.page.clock.runFor(200);
    const state = await inspect(probe.page);
    assert(
      state.animations === 0 &&
        state.state === "loading" &&
        state.slot.width === 64,
      "Static motion preference ignored",
    );
    checks[mode] = state;
    if (mode === "reduced")
      await probe.page.screenshot({
        path: path.join(out, "startup-reduced-motion.png"),
      });
    await probe.context.close();
  }
  await fs.writeFile(
    path.join(out, "startup-browser-checks.json"),
    JSON.stringify(checks, null, 2),
  );
  process.stdout.write(
    JSON.stringify({
      passed: true,
      evidence: path.join(out, "startup-browser-checks.json"),
    }) + "\n",
  );
} finally {
  await browser.close();
  server.close();
}
