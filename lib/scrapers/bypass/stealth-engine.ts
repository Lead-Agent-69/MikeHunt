// lib/scrapers/bypass/stealth-engine.ts
// ─── Advanced Anti-Detection Stealth Engine (Free Solutions) ──────────────────

import type { Page, BrowserContext } from "playwright";

export interface StealthConfig {
  randomizeFingerprint: boolean;
  simulateHumanBehavior: boolean;
  randomizeTimings: boolean;
  spoofWebGL: boolean;
  spoofCanvas: boolean;
}

const DEFAULT_CONFIG: StealthConfig = {
  randomizeFingerprint: true,
  simulateHumanBehavior: true,
  randomizeTimings: true,
  spoofWebGL: true,
  spoofCanvas: true,
};

/**
 * Apply stealth techniques to a Playwright page
 */
export async function applyStealth(
  page: Page,
  config: Partial<StealthConfig> = {},
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 1. Remove webdriver flag
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false,
    });
  });

  // 2. Spoof plugins
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "plugins", {
      get: () => [
        {
          0: {
            type: "application/x-google-chrome-pdf",
            suffixes: "pdf",
            description: "Portable Document Format",
            enabledPlugin: Plugin,
          },
          description: "Portable Document Format",
          filename: "internal-pdf-viewer",
          length: 1,
          name: "Chrome PDF Plugin",
        },
        {
          0: {
            type: "application/pdf",
            suffixes: "pdf",
            description: "",
            enabledPlugin: Plugin,
          },
          description: "",
          filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
          length: 1,
          name: "Chrome PDF Viewer",
        },
      ],
    });
  });

  // 3. Spoof languages
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
  });

  // 4. Randomize canvas fingerprint (if enabled)
  if (cfg.spoofCanvas) {
    await page.addInitScript(() => {
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const originalToBlob = HTMLCanvasElement.prototype.toBlob;
      const originalGetImageData =
        CanvasRenderingContext2D.prototype.getImageData;

      // Add tiny random noise to canvas
      const noise = () => Math.floor(Math.random() * 10) - 5;

      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const context = this.getContext("2d");
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] += noise();
            imageData.data[i + 1] += noise();
            imageData.data[i + 2] += noise();
          }
          context.putImageData(imageData, 0, 0);
        }
        return originalToDataURL.apply(this, args as any);
      };
    });
  }

  // 5. Spoof WebGL vendor/renderer (if enabled)
  if (cfg.spoofWebGL) {
    await page.addInitScript(() => {
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) {
          return "Intel Inc."; // UNMASKED_VENDOR_WEBGL
        }
        if (parameter === 37446) {
          return "Intel Iris OpenGL Engine"; // UNMASKED_RENDERER_WEBGL
        }
        return getParameter.apply(this, [parameter]);
      };
    });
  }

  // 6. Randomize screen resolution (if enabled)
  if (cfg.randomizeFingerprint) {
    const resolutions = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1536, height: 864 },
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
    ];
    const resolution =
      resolutions[Math.floor(Math.random() * resolutions.length)];

    await page.setViewportSize(resolution);
  }

  // 7. Randomize timezone via script injection
  if (cfg.randomizeFingerprint) {
    const timezones = [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Phoenix",
    ];
    const timezone = timezones[Math.floor(Math.random() * timezones.length)];

    await page.addInitScript((tz) => {
      // Override timezone
      const originalDateTimeFormat = Intl.DateTimeFormat;
      Intl.DateTimeFormat = function (...args: any[]) {
        if (args.length === 0 || !args[1]) {
          args[1] = { timeZone: tz };
        } else if (!args[1].timeZone) {
          args[1].timeZone = tz;
        }
        return new originalDateTimeFormat(...args);
      } as any;
    }, timezone);
  }

  // 8. Spoof permissions
  await page.addInitScript(() => {
    const originalQuery = navigator.permissions.query;
    navigator.permissions.query = (parameters: any) => {
      if (parameters.name === "notifications") {
        return Promise.resolve({ state: "denied" } as PermissionStatus);
      }
      return originalQuery(parameters);
    };
  });
}

/**
 * Simulate human-like mouse movements
 */
export async function humanMouseMove(
  page: Page,
  selector: string,
): Promise<void> {
  try {
    const element = await page.$(selector);
    if (!element) return;

    const box = await element.boundingBox();
    if (!box) return;

    // Get current mouse position (start from random point)
    const startX = Math.random() * 100;
    const startY = Math.random() * 100;

    // Target position (center of element with slight randomness)
    const targetX = box.x + box.width / 2 + (Math.random() * 20 - 10);
    const targetY = box.y + box.height / 2 + (Math.random() * 20 - 10);

    // Move in steps (simulate human movement)
    const steps = 10 + Math.floor(Math.random() * 10);
    for (let i = 0; i <= steps; i++) {
      const x = startX + (targetX - startX) * (i / steps);
      const y = startY + (targetY - startY) * (i / steps);
      await page.mouse.move(x, y);
      await randomDelay(10, 30);
    }
  } catch (error) {
    // Ignore errors, just skip human movement
  }
}

/**
 * Simulate human-like scrolling
 */
export async function humanScroll(
  page: Page,
  distance: number = 500,
): Promise<void> {
  const steps = 5 + Math.floor(Math.random() * 5);
  const stepSize = distance / steps;

  for (let i = 0; i < steps; i++) {
    await page.evaluate((step) => {
      window.scrollBy(0, step);
    }, stepSize);
    await randomDelay(100, 300);
  }
}

/**
 * Random delay (human-like timing)
 */
export async function randomDelay(min: number, max: number): Promise<void> {
  const delay = min + Math.random() * (max - min);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Simulate human-like typing
 */
export async function humanType(
  page: Page,
  selector: string,
  text: string,
): Promise<void> {
  await page.click(selector);
  await randomDelay(100, 300);

  for (const char of text) {
    await page.keyboard.type(char);
    await randomDelay(50, 150); // Random delay between keystrokes
  }
}

/**
 * Random "mistake" - hover over wrong element briefly
 */
export async function randomMistake(page: Page): Promise<void> {
  if (Math.random() > 0.7) {
    // 30% chance
    const x = Math.random() * 800;
    const y = Math.random() * 600;
    await page.mouse.move(x, y);
    await randomDelay(200, 500);
  }
}

/**
 * Apply context-level stealth (for all pages in context)
 */
export async function applyContextStealth(
  context: BrowserContext,
): Promise<void> {
  // Set extra HTTP headers
  await context.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    DNT: "1",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
  });

  // Grant permissions
  await context.grantPermissions(["geolocation"]);

  // Set geolocation (random US city)
  const locations = [
    { latitude: 40.7128, longitude: -74.006 }, // NYC
    { latitude: 34.0522, longitude: -118.2437 }, // LA
    { latitude: 41.8781, longitude: -87.6298 }, // Chicago
    { latitude: 29.7604, longitude: -95.3698 }, // Houston
    { latitude: 33.4484, longitude: -112.074 }, // Phoenix
  ];
  const location = locations[Math.floor(Math.random() * locations.length)];
  await context.setGeolocation(location);
}

/**
 * Generate random browser fingerprint data
 */
export function generateFingerprint() {
  const screens = [
    { width: 1920, height: 1080, colorDepth: 24 },
    { width: 1366, height: 768, colorDepth: 24 },
    { width: 1536, height: 864, colorDepth: 24 },
    { width: 1440, height: 900, colorDepth: 24 },
    { width: 2560, height: 1440, colorDepth: 24 },
  ];

  const timezones = [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Phoenix",
  ];

  const languages = [["en-US", "en"], ["en-US", "en", "es"], ["en-US"]];

  return {
    screen: screens[Math.floor(Math.random() * screens.length)],
    timezone: timezones[Math.floor(Math.random() * timezones.length)],
    languages: languages[Math.floor(Math.random() * languages.length)],
    hardwareConcurrency: [2, 4, 8, 16][Math.floor(Math.random() * 4)],
    deviceMemory: [4, 8, 16][Math.floor(Math.random() * 3)],
  };
}

/**
 * Wait for page load with random human-like delay
 */
export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await randomDelay(500, 1500); // Human-like pause after page load

  // Random scroll to simulate reading
  if (Math.random() > 0.5) {
    await humanScroll(page, 200 + Math.random() * 300);
  }
}

/**
 * Session manager for maintaining consistent fingerprints
 */
export class SessionManager {
  private fingerprints = new Map<string, any>();

  getFingerprint(sessionId: string): any {
    if (!this.fingerprints.has(sessionId)) {
      this.fingerprints.set(sessionId, generateFingerprint());
    }
    return this.fingerprints.get(sessionId);
  }

  clearSession(sessionId: string): void {
    this.fingerprints.delete(sessionId);
  }

  clearAll(): void {
    this.fingerprints.clear();
  }
}

export const sessionManager = new SessionManager();
