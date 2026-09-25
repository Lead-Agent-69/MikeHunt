// lib/scrapers/bypass/proxy-manager.ts
// Proxy rotation and management for Bright Data / Oxylabs

export interface ProxyConfig {
  url: string;
  username?: string;
  password?: string;
  host?: string;
  port?: number;
}

export class ProxyManager {
  private proxies: ProxyConfig[] = [];
  private currentIndex = 0;
  private failedProxies = new Set<string>();
  private proxyStats = new Map<
    string,
    { requests: number; failures: number; lastUsed: number }
  >();

  constructor(proxyUrls?: string | string[]) {
    this.loadProxies(proxyUrls);
  }

  /**
   * Load proxies from environment or provided URLs
   */
  private loadProxies(proxyUrls?: string | string[]) {
    const urls = proxyUrls || process.env.PROXY_URLS;

    if (!urls) {
      console.warn("[ProxyManager] No proxy URLs configured");
      return;
    }

    const urlList =
      typeof urls === "string" ? urls.split(",").map((u) => u.trim()) : urls;

    this.proxies = urlList
      .map((url) => this.parseProxyUrl(url))
      .filter(Boolean) as ProxyConfig[];

    console.log(`[ProxyManager] Loaded ${this.proxies.length} proxies`);
  }

  /**
   * Parse proxy URL into config
   * Format: http://username:password@host:port
   */
  private parseProxyUrl(url: string): ProxyConfig | null {
    try {
      const parsed = new URL(url);
      return {
        url,
        username: parsed.username || undefined,
        password: parsed.password || undefined,
        host: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port) : 80,
      };
    } catch (error) {
      console.error(`[ProxyManager] Invalid proxy URL: ${url}`);
      return null;
    }
  }

  /**
   * Get next available proxy (round-robin with failure tracking)
   */
  getNext(): ProxyConfig | null {
    if (this.proxies.length === 0) {
      return null;
    }

    // Try to find a working proxy
    const maxAttempts = this.proxies.length;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const proxy = this.proxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;

      // Skip failed proxies (with cooldown)
      if (this.failedProxies.has(proxy.url)) {
        const stats = this.proxyStats.get(proxy.url);
        const cooldownPeriod = 5 * 60 * 1000; // 5 minutes
        if (stats && Date.now() - stats.lastUsed < cooldownPeriod) {
          attempts++;
          continue;
        } else {
          // Cooldown expired, give it another chance
          this.failedProxies.delete(proxy.url);
        }
      }

      // Update stats
      const stats = this.proxyStats.get(proxy.url) || {
        requests: 0,
        failures: 0,
        lastUsed: 0,
      };
      stats.requests++;
      stats.lastUsed = Date.now();
      this.proxyStats.set(proxy.url, stats);

      return proxy;
    }

    // All proxies failed, return first one anyway
    console.warn("[ProxyManager] All proxies failed, returning first proxy");
    return this.proxies[0];
  }

  /**
   * Get a random proxy (useful for parallel requests)
   */
  getRandom(): ProxyConfig | null {
    if (this.proxies.length === 0) {
      return null;
    }

    const availableProxies = this.proxies.filter(
      (p) => !this.failedProxies.has(p.url),
    );

    if (availableProxies.length === 0) {
      // All failed, pick random from all
      return this.proxies[Math.floor(Math.random() * this.proxies.length)];
    }

    return availableProxies[
      Math.floor(Math.random() * availableProxies.length)
    ];
  }

  /**
   * Mark a proxy as failed
   */
  markFailed(proxyUrl: string) {
    this.failedProxies.add(proxyUrl);
    const stats = this.proxyStats.get(proxyUrl);
    if (stats) {
      stats.failures++;
    }
    console.warn(`[ProxyManager] Proxy marked as failed: ${proxyUrl}`);
  }

  /**
   * Mark a proxy as successful (remove from failed set)
   */
  markSuccess(proxyUrl: string) {
    this.failedProxies.delete(proxyUrl);
  }

  /**
   * Get proxy statistics
   */
  getStats() {
    return {
      total: this.proxies.length,
      failed: this.failedProxies.size,
      stats: Array.from(this.proxyStats.entries()).map(([url, stats]) => ({
        url: url.replace(/:[^:]+@/, ":***@"), // Hide password
        ...stats,
        failureRate:
          stats.requests > 0 ? (stats.failures / stats.requests) * 100 : 0,
      })),
    };
  }

  /**
   * Check if proxies are configured
   */
  hasProxies(): boolean {
    return this.proxies.length > 0;
  }
}

// Singleton instance
let proxyManagerInstance: ProxyManager | null = null;

export function getProxyManager(): ProxyManager {
  if (!proxyManagerInstance) {
    proxyManagerInstance = new ProxyManager();
  }
  return proxyManagerInstance;
}

/**
 * Convert ProxyConfig to axios/fetch proxy format
 */
export function proxyConfigToAxios(proxy: ProxyConfig | null) {
  if (!proxy) return undefined;

  return {
    host: proxy.host!,
    port: proxy.port!,
    auth:
      proxy.username && proxy.password
        ? {
            username: proxy.username,
            password: proxy.password,
          }
        : undefined,
  };
}

/**
 * Convert ProxyConfig to URL string
 */
export function proxyConfigToUrl(
  proxy: ProxyConfig | null,
): string | undefined {
  if (!proxy) return undefined;
  return proxy.url;
}
