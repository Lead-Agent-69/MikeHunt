import { chromium } from "playwright";

async function runAudit() {
  console.log("🚀 Starting E2E Accuracy & Usability Audit...");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const errors: string[] = [];
  page.on("pageerror", (exception) => {
    errors.push(`Uncaught exception: "${exception}"`);
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(`Console error: "${msg.text()}"`);
    }
  });

  const routes = ["/", "/deal-check", "/discover", "/saved", "/login"];

  for (const route of routes) {
    const url = `http://localhost:3000${route}`;
    console.log(`Checking ${url}...`);
    try {
      const response = await page.goto(url, { waitUntil: "networkidle" });
      if (response && !response.ok()) {
        errors.push(`Route ${route} returned status ${response.status()}`);
      }
    } catch (e: any) {
      errors.push(`Failed to load ${route}: ${e.message}`);
    }
  }

  console.log("\n✅ Audit Complete!");
  if (errors.length > 0) {
    console.log(`Found ${errors.length} issues:`);
    errors.forEach((e) => console.log(`- ${e}`));
  } else {
    console.log("No console errors or broken routes detected.");
  }

  await browser.close();
}

runAudit();
