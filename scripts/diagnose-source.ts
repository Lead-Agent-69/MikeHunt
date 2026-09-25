// Fetch any gated source via FlareSolverr and report HOW its listing data is embedded, so writing a
// robust parser is fast. Usage (needs a reachable FlareSolverr):
//   FLARESOLVERR_URL=http://localhost:8191 npx tsx scripts/diagnose-source.ts "<search-results-url>"
//
// It detects the common patterns we already parse (data-vehicle-details, __NEXT_DATA__, AJAX JSON,
// window state, JSON-LD) and prints a sample so the embedded-JSON parser can be written/verified in
// one shot — the playbook used for cars.com + AutoTrader.
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.argv[2];
if (!url) {
  console.error('Pass a URL: npx tsx scripts/diagnose-source.ts "https://…"');
  process.exit(1);
}
const FS = process.env.FLARESOLVERR_URL || "http://localhost:8191";

(async () => {
  const res = await fetch(FS.endsWith("/v1") ? FS : `${FS}/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd: "request.get", url, maxTimeout: 90000 }),
  });
  const data: any = await res.json();
  const html: string = data?.solution?.response || "";
  console.log(`status: ${data?.status} | length: ${html.length}`);
  if (!html) {
    console.log("no HTML — FlareSolverr failed or the site blocked it.");
    return;
  }

  const count = (re: RegExp) => (html.match(re) || []).length;
  const signals: Record<string, number | boolean> = {
    looksLikeJSON: html.trim().startsWith("{") || html.trim().startsWith("["),
    __NEXT_DATA__: html.includes("__NEXT_DATA__"),
    "data-vehicle-details": count(/data-vehicle-details=/g),
    "json-ld blocks": count(/application\/ld\+json/g),
    "window.__ assigns": count(/window\.__[A-Z_]+\s*=/g),
    '"listings":[': count(/"listings"\s*:\s*\[/g),
    '"vin"': count(/"vin"/gi),
    '"price"': count(/"price"/gi),
    '"mileage"': count(/"mileage"/gi),
    '"listingId"': count(/"listingId"/gi),
    "data-listing-id": count(/data-listing-id=/g),
  };
  console.log("signals:", JSON.stringify(signals, null, 2));

  // Show a small sample around the strongest listing signal.
  for (const probe of [
    "data-vehicle-details=",
    '"listings":[',
    "__NEXT_DATA__",
    '"vin"',
  ]) {
    const i = html.indexOf(probe.replace("[", "["));
    if (i >= 0) {
      console.log(`\n--- sample around '${probe}' ---`);
      console.log(html.slice(i, i + 500).replace(/\s+/g, " "));
      break;
    }
  }
})()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERR:", e.message);
    process.exit(1);
  });
