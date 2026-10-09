// Read-only production checks. No credentials, account creation, or collection requests.
const base = new URL(process.argv[2] || "https://mikehunt-69.vercel.app");
if (!["https:", "http:"].includes(base.protocol)) {
  throw new Error("Use an HTTP or HTTPS app URL.");
}
let failures = 0;
async function check(path, verify, init = {}) {
  const started = performance.now();
  try {
    const response = await fetch(new URL(path, base), {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      ...init,
    });
    await verify(response);
    console.log(`PASS ${path} (${Math.round(performance.now() - started)}ms)`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${path}: ${error.message}`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
for (const path of [
  "/login",
  "/register",
  "/forgot-password",
  "/privacy",
  "/tos",
  "/offline.html",
]) {
  await check(path, async (response) => {
    assert(response.status === 200, `HTTP ${response.status}`);
    assert(
      response.headers.get("content-type")?.includes("text/html"),
      "Expected HTML",
    );
    const html = await response.text();
    assert(
      !/SUPABASE_SERVICE_ROLE_KEY|BEGIN PRIVATE KEY|postgres:\/\//.test(html),
      "Private configuration exposed",
    );
  });
}
for (const path of [
  "/brand/MIKEHUNT-M.svg",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/icon-maskable-512x512.png",
]) {
  await check(path, async (response) => {
    assert(response.status === 200, `HTTP ${response.status}`);
    assert(
      response.headers.get("content-type")?.startsWith("image/"),
      "Expected image",
    );
    assert((await response.arrayBuffer()).byteLength > 100, "Empty asset");
  });
}
await check("/manifest.json", async (response) => {
  assert(response.status === 200, `HTTP ${response.status}`);
  const manifest = await response.json();
  assert(
    manifest.start_url === "/discover",
    "Unexpected installation destination",
  );
  assert(
    manifest.icons?.some(
      (icon) => icon.sizes === "512x512" && icon.purpose === "maskable",
    ),
    "Missing maskable installation icon",
  );
});
for (const path of [
  "/admin",
  "/developer",
  "/orchestrator",
  "/sources",
  "/status",
]) {
  await check(path, async (response) => {
    assert(
      [302, 303, 307, 308].includes(response.status),
      `Private page returned HTTP ${response.status}`,
    );
    const destination = new URL(response.headers.get("location") || "", base);
    assert(
      destination.origin === base.origin && destination.pathname === "/login",
      "Expected same-origin sign-in gate",
    );
  });
}
await check("/api/admin/stats", async (response) => {
  assert(
    response.status === 401 || response.status === 403,
    `Admin data returned HTTP ${response.status}`,
  );
});
await check(
  "/api/deal-check",
  async (response) => {
    assert(
      response.status === 401,
      `Unauthenticated analysis returned HTTP ${response.status}`,
    );
    const body = await response.json();
    assert(
      typeof body.error === "string" && !body.extracted,
      "Expected sign-in guidance without analysis",
    );
  },
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  },
);
await check("/api/admin/system", async (response) => {
  assert(response.status === 200, `HTTP ${response.status}`);
  const body = await response.json();
  assert(
    Object.keys(body).every((key) => ["status", "timestamp"].includes(key)),
    "Process diagnostics exposed to anonymous requests",
  );
});
await check("/api/system/status", async (response) => {
  assert(response.status === 200, `HTTP ${response.status}`);
  const body = await response.json();
  assert(body.scope === "public", "Expected public-only health data");
  assert(
    !["environment", "memory", "uptime", "runs", "secrets"].some(
      (key) => key in body,
    ),
    "Internal diagnostics exposed",
  );
  console.log(
    `INFO buyerReady=${body.buyerReady} decisionReady=${body.decisionReady} activeDeals=${body.activeDeals}`,
  );
});
console.log(
  `Smoke check complete: ${failures} failed. Authenticated workflows and visual QA are separate checks.`,
);
process.exitCode = failures ? 1 : 0;
