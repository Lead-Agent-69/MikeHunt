// lib/scrapers/adaptive-engine.ts
// Adaptive scraping engine: static HTTP first, then escalate to a real browser
// only when blocked. Remembers the winning strategy per host to minimize cost.

import { BrowserContext, Page } from 'playwright'
import * as cheerio from 'cheerio'
import pRetry from 'p-retry'
import { ScraperConfig } from './engine'
import { BrowserProfile, ProfileManager } from './tools/profile-manager'
import { HumanBehavior } from './tools/human-behavior'
import { ProxyManager } from './tools/proxy-manager'
import { BrowserPoolManager } from './tools/browser-pool'

export type EngineMode = 'static' | 'browser'

export interface AdaptiveEngineOptions {
  profileManager?: ProfileManager
  proxyManager?: ProxyManager
  humanBehavior?: HumanBehavior
  browserPool?: BrowserPoolManager
  /** Try static mode first even if a host is marked as browser? */
  alwaysProbeStatic?: boolean
  /** Max browser pages per run */
  maxBrowserPages?: number
}

export interface FetchResult {
  url: string
  html: string
  $: cheerio.CheerioAPI
  mode: EngineMode
  page?: Page
  close: () => Promise<void>
  fromCache?: boolean
}

interface CacheEntry {
  html: string
  fetchedAt: number
}

export interface CacheOptions {
  ttlMs: number
  maxEntries: number
}

export class AdaptiveEngine {
  private profileManager: ProfileManager
  private humanBehavior: HumanBehavior
  private proxyManager?: ProxyManager
  private browserPool: BrowserPoolManager
  private options: AdaptiveEngineOptions
  private browserPages = 0
  /** Per-host preferred mode cache */
  private hostModeCache: Map<string, EngineMode> = new Map()
  private staticCache: Map<string, CacheEntry> = new Map()
  private cacheOptions: CacheOptions

  constructor(options: AdaptiveEngineOptions = {}, cacheOptions: Partial<CacheOptions> = {}) {
    this.options = {
      alwaysProbeStatic: false,
      maxBrowserPages: 10,
      ...options,
    }
    this.cacheOptions = {
      ttlMs: 60_000,
      maxEntries: 200,
      ...cacheOptions,
    }
    this.profileManager = options.profileManager || new ProfileManager()
    this.humanBehavior = options.humanBehavior || new HumanBehavior()
    this.proxyManager = options.proxyManager
    this.browserPool = options.browserPool || new BrowserPoolManager({
      proxyManager: this.proxyManager,
      profileManager: this.profileManager,
    })
  }

  async fetch(url: string, config: ScraperConfig, waitForSelector?: string): Promise<FetchResult> {
    const host = new URL(url).hostname
    const preferredMode = this.hostModeCache.get(host)
    const tryStaticFirst = this.options.alwaysProbeStatic || preferredMode === 'static' || preferredMode === undefined

    const cached = this.getCached(url)
    if (cached) {
      return { url, html: cached, $: cheerio.load(cached), mode: 'static', close: async () => {}, fromCache: true }
    }

    if (tryStaticFirst) {
      try {
        const result = await this.fetchStatic(url, config)
        if (this.isValidHtml(result.html, waitForSelector)) {
          this.hostModeCache.set(host, 'static')
          this.setCache(url, result.html)
          return { ...result, fromCache: false }
        }
      } catch (err) {
        console.warn(`[AdaptiveEngine] static fetch failed for ${host}:`, (err as Error).message)
      }
    }

    try {
      const browserResult = await this.fetchBrowser(url, config, waitForSelector)
      this.hostModeCache.set(host, 'browser')
      return browserResult
    } catch (err) {
      this.hostModeCache.set(host, 'browser')
      throw err
    }
  }

  private async fetchStatic(url: string, config: ScraperConfig): Promise<FetchResult> {
    const profile = this.profileManager.getProfile(config.name)
    const proxy = this.proxyManager?.getProxy({ country: 'US' })

    const res = await pRetry(
      async () => {
        const response = await fetch(url, {
          headers: {
            'User-Agent': profile.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'sec-ch-ua': `"Not.A/Brand";v="8", "Chromium";v="${this.extractMajorVersion(profile.userAgent)}", "Google Chrome";v="${this.extractMajorVersion(profile.userAgent)}"`,
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': `"${this.platformName(profile.platform)}"`,
            ...config.headers,
          },
        })
        if (response.status === 429) throw new Error('RATE_LIMITED')
        if (response.status >= 500) throw new Error(`HTTP ${response.status}`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response
      },
      {
        retries: 2,
        factor: 2,
        minTimeout: 2000,
        maxTimeout: 10000,
        onFailedAttempt: (err) => console.warn(`[AdaptiveEngine] static retry ${err.attemptNumber}: ${err.message}`),
      }
    )

    const html = await res.text()
    return {
      url,
      html,
      $: cheerio.load(html),
      mode: 'static',
      close: async () => {},
    }
  }

  private async fetchBrowser(url: string, config: ScraperConfig, waitForSelector?: string): Promise<FetchResult> {
    if (this.browserPages >= (this.options.maxBrowserPages || 10)) {
      throw new Error(`[AdaptiveEngine] max browser pages reached`)
    }

    const { page, release } = await this.browserPool.getPage(config.name)
    this.browserPages++

    await page.route('**/*', (route) => {
      const type = route.request().resourceType()
      if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
        route.abort()
      } else {
        route.continue()
      }
    })

    await this.humanBehavior.waitAfterLoad(page)

    await pRetry(
      async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
        if (waitForSelector) {
          await page.waitForSelector(waitForSelector, { timeout: 10000 })
        }
      },
      { retries: 2, minTimeout: 3000 }
    )

    await this.humanBehavior.naturalize(page)

    const html = await page.content()
    return {
      url,
      html,
      $: cheerio.load(html),
      mode: 'browser',
      page,
      close: async () => {
        await release()
        this.browserPages = Math.max(0, this.browserPages - 1)
      },
    }
  }

  private async applyProfile(context: BrowserContext, profile: BrowserProfile): Promise<void> {
    await context.addInitScript((p: BrowserProfile) => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
      Object.defineProperty(navigator, 'languages', { get: () => [p.locale, 'en'] })
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => p.hardwareConcurrency })
      Object.defineProperty(navigator, 'deviceMemory', { get: () => p.deviceMemory })
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => p.maxTouchPoints })
      Object.defineProperty(screen, 'width', { get: () => p.screen.width })
      Object.defineProperty(screen, 'height', { get: () => p.screen.height })
      Object.defineProperty(screen, 'availWidth', { get: () => p.screen.width })
      Object.defineProperty(screen, 'availHeight', { get: () => p.screen.height - 40 })
      Object.defineProperty(screen, 'colorDepth', { get: () => p.screen.colorDepth })
      Object.defineProperty(screen, 'pixelDepth', { get: () => p.screen.colorDepth })
    }, profile)
  }

  private isValidHtml(html: string, waitForSelector?: string): boolean {
    if (!html || html.length < 200) return false
    const $ = cheerio.load(html)
    if (this.looksLikeBlock($)) return false
    if (waitForSelector && $(waitForSelector).length === 0) return false
    return true
  }

  private looksLikeBlock($: cheerio.CheerioAPI): boolean {
    const text = $('body').text().toLowerCase()
    const blockers = ['captcha', 'blocked', 'access denied', 'forbidden', 'cloudflare', 'please wait', 'verify you are human']
    return blockers.some(b => text.includes(b))
  }

  private extractMajorVersion(userAgent: string): string {
    const match = userAgent.match(/Chrome\/(\d+)/)
    return match ? match[1] : '131'
  }

  private platformName(platform: string): string {
    if (platform === 'MacIntel') return 'macOS'
    if (platform === 'Win32') return 'Windows'
    return 'Linux'
  }

  async close(): Promise<void> {
    await this.browserPool.close()
    this.browserPages = 0
  }

  getHostModeCache(): Record<string, EngineMode> {
    return Object.fromEntries(this.hostModeCache)
  }

  private getCached(url: string): string | null {
    const entry = this.staticCache.get(url)
    if (!entry) return null
    if (Date.now() - entry.fetchedAt > this.cacheOptions.ttlMs) {
      this.staticCache.delete(url)
      return null
    }
    return entry.html
  }

  private setCache(url: string, html: string) {
    if (this.staticCache.size >= this.cacheOptions.maxEntries) {
      const oldest = this.staticCache.keys().next().value
      if (oldest) this.staticCache.delete(oldest)
    }
    this.staticCache.set(url, { html, fetchedAt: Date.now() })
  }
}
