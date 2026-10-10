#!/usr/bin/env node
// Sequential API latency/payload sampler. Gentle by design: one request at a time with a fixed gap
// (default 2.2s, under the strictest route limit: /api/deals/map 30/min). Never sends writes.
//
//   node e2e/perf/api-p95.mjs --base https://mikehunt-69.vercel.app --samples 25 --out prod-api.json
//   node e2e/perf/api-p95.mjs --base http://127.0.0.1:3100 --samples 25 --gap 1100 --cookie "<sb cookie>"
import { writeFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { gunzipSync, brotliDecompressSync, inflateSync } from "node:zlib";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://127.0.0.1:3000");
const SAMPLES = Number(arg("samples", "25"));
const GAP = Number(arg("gap", "2200"));
const COOKIE = arg("cookie", "");
const OUT = arg("out", "");
const ONLY = arg("only", "");
const DEFAULT_ENDPOINTS = [
  { name: "deals (UI-sized, limit=24)", path: "/api/deals?limit=24" },
  {
    name: "deals (default, no limit)",
    path: "/api/deals",
    samples: Math.min(SAMPLES, 10),
  },
  { name: "discover (guest default)", path: "/api/discover" },
  { name: "deals/map (default limit=1000)", path: "/api/deals/map" },
  { name: "feed (limit=12)", path: "/api/feed?offset=0&limit=12" },
  { name: "sold (Ford F-150)", path: "/api/sold?make=Ford&model=F-150" },
];
const ENDPOINTS = ONLY
  ? DEFAULT_ENDPOINTS.filter((e) => e.path.includes(ONLY))
  : DEFAULT_ENDPOINTS;

function get(path) {
  const url = new URL(path, BASE);
  const req = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    let ttfb = 0;
    const r = req(
      url,
      {
        method: "GET",
        headers: {
          "accept-encoding": "br, gzip",
          accept: "application/json",
          "user-agent": "mikehunt-audit-perf/1.0 (sequential, read-only)",
          ...(COOKIE ? { cookie: COOKIE } : {}),
        },
      },
      (res) => {
        ttfb = performance.now() - t0;
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const wire = Buffer.concat(chunks);
          const enc = res.headers["content-encoding"] || "identity";
          let body = wire;
          try {
            body =
              enc === "br"
                ? brotliDecompressSync(wire)
                : enc === "gzip"
                  ? gunzipSync(wire)
                  : enc === "deflate"
                    ? inflateSync(wire)
                    : wire;
          } catch {}
          let rows = null;
          try {
            const j = JSON.parse(body.toString());
            rows = Array.isArray(j)
              ? j.length
              : Object.fromEntries(
                  Object.entries(j)
                    .filter(([, v]) => Array.isArray(v))
                    .map(([k, v]) => [k, v.length]),
                );
          } catch {}
          resolve({
            status: res.statusCode,
            ttfbMs: ttfb,
            totalMs: performance.now() - t0,
            wireBytes: wire.length,
            bodyBytes: body.length,
            encoding: enc,
            cache: res.headers["x-vercel-cache"] || null,
            rows,
          });
        });
      },
    );
    r.on("error", reject);
    r.setTimeout(30000, () => r.destroy(new Error("timeout 30s")));
    r.end();
  });
}
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length
    ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]
    : null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
for (const ep of ENDPOINTS) {
  const n = ep.samples || SAMPLES;
  const runs = [];
  for (let i = 0; i < n; i++) {
    try {
      runs.push(await get(ep.path));
    } catch (e) {
      runs.push({ status: 0, error: String(e.message || e) });
    }
    await sleep(GAP);
  }
  const ok = runs.filter((r) => r.status === 200);
  const tot = ok.map((r) => r.totalMs);
  const summary = {
    endpoint: ep.name,
    path: ep.path,
    samples: n,
    ok: ok.length,
    statuses: runs.reduce(
      (m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m),
      {},
    ),
    firstMs: runs[0]?.totalMs ?? null,
    p50Ms: pct(tot, 50),
    p95Ms: pct(tot, 95),
    maxMs: tot.length ? Math.max(...tot) : null,
    ttfbP95Ms: pct(
      ok.map((r) => r.ttfbMs),
      95,
    ),
    wireBytesMedian: pct(
      ok.map((r) => r.wireBytes),
      50,
    ),
    bodyBytesMedian: pct(
      ok.map((r) => r.bodyBytes),
      50,
    ),
    encoding: ok[0]?.encoding ?? null,
    rows: ok[0]?.rows ?? null,
    vercelCache: [...new Set(ok.map((r) => r.cache))],
  };
  results.push({ ...summary, runs });
  console.log(
    `${ep.name.padEnd(32)} ok ${ok.length}/${n} first ${summary.firstMs?.toFixed(0)}ms p50 ${summary.p50Ms?.toFixed(0)}ms p95 ${summary.p95Ms?.toFixed(0)}ms max ${summary.maxMs?.toFixed(0)}ms wire ${(summary.wireBytesMedian / 1024).toFixed(1)}KB body ${(summary.bodyBytesMedian / 1024).toFixed(1)}KB enc ${summary.encoding} rows ${JSON.stringify(summary.rows)}`,
  );
}
if (OUT)
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        base: BASE,
        at: new Date().toISOString(),
        samples: SAMPLES,
        gapMs: GAP,
        results,
      },
      null,
      2,
    ),
  );
