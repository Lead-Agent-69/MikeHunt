// lib/scrapers/bypass/user-agent-pool.ts
// ─── Comprehensive User Agent Pool (50+ agents) ───────────────────────────────

export interface UserAgentData {
  userAgent: string;
  platform: "Windows" | "Mac" | "Linux" | "iOS" | "Android";
  browser: "Chrome" | "Firefox" | "Safari" | "Edge";
  mobile: boolean;
}

/**
 * Comprehensive user agent pool - 50+ real user agents
 */
const USER_AGENTS: UserAgentData[] = [
  // Chrome on Windows (latest versions)
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "Windows",
    browser: "Chrome",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    platform: "Windows",
    browser: "Chrome",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    platform: "Windows",
    browser: "Chrome",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "Windows",
    browser: "Chrome",
    mobile: false,
  },

  // Chrome on Mac
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "Mac",
    browser: "Chrome",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    platform: "Mac",
    browser: "Chrome",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "Mac",
    browser: "Chrome",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "Mac",
    browser: "Chrome",
    mobile: false,
  },

  // Chrome on Linux
  {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "Linux",
    browser: "Chrome",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    platform: "Linux",
    browser: "Chrome",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "Linux",
    browser: "Chrome",
    mobile: false,
  },

  // Firefox on Windows
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    platform: "Windows",
    browser: "Firefox",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    platform: "Windows",
    browser: "Firefox",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
    platform: "Windows",
    browser: "Firefox",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 11.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    platform: "Windows",
    browser: "Firefox",
    mobile: false,
  },

  // Firefox on Mac
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
    platform: "Mac",
    browser: "Firefox",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
    platform: "Mac",
    browser: "Firefox",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13.6; rv:133.0) Gecko/20100101 Firefox/133.0",
    platform: "Mac",
    browser: "Firefox",
    mobile: false,
  },

  // Firefox on Linux
  {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
    platform: "Linux",
    browser: "Firefox",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
    platform: "Linux",
    browser: "Firefox",
    mobile: false,
  },

  // Safari on Mac
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    platform: "Mac",
    browser: "Safari",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    platform: "Mac",
    browser: "Safari",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    platform: "Mac",
    browser: "Safari",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
    platform: "Mac",
    browser: "Safari",
    mobile: false,
  },

  // Edge on Windows
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    platform: "Windows",
    browser: "Edge",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    platform: "Windows",
    browser: "Edge",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    platform: "Windows",
    browser: "Edge",
    mobile: false,
  },

  // Edge on Mac
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    platform: "Mac",
    browser: "Edge",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    platform: "Mac",
    browser: "Edge",
    mobile: false,
  },

  // Mobile Chrome on Android
  {
    userAgent:
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36",
    platform: "Android",
    browser: "Chrome",
    mobile: true,
  },
  {
    userAgent:
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36",
    platform: "Android",
    browser: "Chrome",
    mobile: true,
  },
  {
    userAgent:
      "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.107 Mobile Safari/537.36",
    platform: "Android",
    browser: "Chrome",
    mobile: true,
  },
  {
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36",
    platform: "Android",
    browser: "Chrome",
    mobile: true,
  },
  {
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36",
    platform: "Android",
    browser: "Chrome",
    mobile: true,
  },

  // Mobile Safari on iOS
  {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    platform: "iOS",
    browser: "Safari",
    mobile: true,
  },
  {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
    platform: "iOS",
    browser: "Safari",
    mobile: true,
  },
  {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    platform: "iOS",
    browser: "Safari",
    mobile: true,
  },
  {
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    platform: "iOS",
    browser: "Safari",
    mobile: true,
  },
  {
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    platform: "iOS",
    browser: "Safari",
    mobile: true,
  },

  // Additional variety - older but still common
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    platform: "Windows",
    browser: "Chrome",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    platform: "Windows",
    browser: "Chrome",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    platform: "Mac",
    browser: "Chrome",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
    platform: "Windows",
    browser: "Firefox",
    mobile: false,
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
    platform: "Mac",
    browser: "Safari",
    mobile: false,
  },

  // More Android devices
  {
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36",
    platform: "Android",
    browser: "Chrome",
    mobile: true,
  },
  {
    userAgent:
      "Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.107 Mobile Safari/537.36",
    platform: "Android",
    browser: "Chrome",
    mobile: true,
  },
  {
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; OnePlus 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36",
    platform: "Android",
    browser: "Chrome",
    mobile: true,
  },

  // More iOS devices
  {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1",
    platform: "iOS",
    browser: "Safari",
    mobile: true,
  },
  {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1",
    platform: "iOS",
    browser: "Safari",
    mobile: true,
  },
];

/**
 * Get a random user agent
 */
export function getRandomUserAgent(options?: {
  platform?: "Windows" | "Mac" | "Linux" | "iOS" | "Android";
  browser?: "Chrome" | "Firefox" | "Safari" | "Edge";
  mobile?: boolean;
}): UserAgentData {
  let pool = USER_AGENTS;

  if (options?.platform) {
    pool = pool.filter((ua) => ua.platform === options.platform);
  }

  if (options?.browser) {
    pool = pool.filter((ua) => ua.browser === options.browser);
  }

  if (options?.mobile !== undefined) {
    pool = pool.filter((ua) => ua.mobile === options.mobile);
  }

  if (pool.length === 0) {
    pool = USER_AGENTS; // Fallback to full pool
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Get a desktop-only user agent
 */
export function getDesktopUserAgent(): UserAgentData {
  return getRandomUserAgent({ mobile: false });
}

/**
 * Get a mobile-only user agent
 */
export function getMobileUserAgent(): UserAgentData {
  return getRandomUserAgent({ mobile: true });
}

/**
 * Get matching headers for a user agent
 */
export function getMatchingHeaders(ua: UserAgentData): Record<string, string> {
  const baseHeaders: Record<string, string> = {
    "User-Agent": ua.userAgent,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    DNT: "1",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
  };

  // Browser-specific headers
  if (ua.browser === "Chrome" || ua.browser === "Edge") {
    baseHeaders["sec-ch-ua"] = `"Chromium";v="131", "Not_A Brand";v="24"`;
    baseHeaders["sec-ch-ua-mobile"] = ua.mobile ? "?1" : "?0";
    baseHeaders["sec-ch-ua-platform"] = `"${ua.platform}"`;
    baseHeaders["Accept"] =
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";
  } else if (ua.browser === "Firefox") {
    baseHeaders["Accept"] =
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8";
  } else if (ua.browser === "Safari") {
    baseHeaders["Accept"] =
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  }

  return baseHeaders;
}

/**
 * User agent rotation manager
 */
export class UserAgentRotator {
  private currentUA: UserAgentData | null = null;
  private sessionStartTime: number = 0;
  private requestCount: number = 0;
  private readonly sessionDuration: number = 3600000; // 1 hour
  private readonly maxRequestsPerSession: number = 100;

  /**
   * Get current user agent (maintains consistency within session)
   */
  getCurrentUA(
    options?: Parameters<typeof getRandomUserAgent>[0],
  ): UserAgentData {
    const now = Date.now();

    // Rotate if session expired or max requests reached
    if (
      !this.currentUA ||
      now - this.sessionStartTime > this.sessionDuration ||
      this.requestCount >= this.maxRequestsPerSession
    ) {
      this.currentUA = getRandomUserAgent(options);
      this.sessionStartTime = now;
      this.requestCount = 0;
    }

    this.requestCount++;
    return this.currentUA;
  }

  /**
   * Force rotation to new user agent
   */
  rotate(options?: Parameters<typeof getRandomUserAgent>[0]): UserAgentData {
    this.currentUA = getRandomUserAgent(options);
    this.sessionStartTime = Date.now();
    this.requestCount = 0;
    return this.currentUA;
  }

  /**
   * Get headers for current session
   */
  getHeaders(): Record<string, string> {
    const ua = this.getCurrentUA();
    return getMatchingHeaders(ua);
  }
}

// Export singleton instance
export const userAgentRotator = new UserAgentRotator();
