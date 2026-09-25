// lib/scrapers/tools/browser-pool.ts
// Lazy, source-aware browser pool with context reuse, memory limits, and stealth injection.

import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { ProxyManager, ProxyConfig } from './proxy-manager'
import { ProfileManager, BrowserProfile } from './profile-manager'

export interface BrowserPoolOptions {
  maxBrowsers?: number
  maxContexts?: number
  maxPagesPerContext?: number
  headless?: boolean
  proxyManager?: ProxyManager
  profileManager?: ProfileManager
  idleTimeoutMs?: number
}

interface ResolvedOptions {
  maxBrowsers: number
  maxContexts: number
  maxPagesPerContext: number
  headless: boolean
  proxyManager?: ProxyManager
  profileManager: ProfileManager
  idleTimeoutMs: number
}

interface PooledContext {
  id: string
  browser: Browser
  context: BrowserContext
  profile: BrowserProfile
  proxy?: ProxyConfig
  sourceId: string
  createdAt: number
  lastUsedAt: number
  pages: Page[]
}

export class BrowserPoolManager {
  private contexts: PooledContext[] = []
  private options: ResolvedOptions
  private proxyManager?: ProxyManager
  private profileManager: ProfileManager
  private initialized = false
  private idleTimer?: NodeJS.Timeout

  constructor(options: BrowserPoolOptions = {}) {
    this.options = {
      maxBrowsers: 2,
      maxContexts: 6,
      maxPagesPerContext: 2,
      headless: true,
      profileManager: new ProfileManager(),
      idleTimeoutMs: 5 * 60 * 1000,
      ...options,
    }
    this.proxyManager = options.proxyManager
    this.profileManager = this.options.profileManager
  }

  async getPage(sourceId: string): Promise<{ page: Page; release: () => Promise<void> }> {
    const pooled = await this.acquireContext(sourceId)
    if (pooled.pages.length >= this.options.maxPagesPerContext) {
      await this.trimOldestPage(pooled)
    }
    const page = await pooled.context.newPage()
    pooled.pages.push(page)
    pooled.lastUsedAt = Date.now()

    const release = async () => {
      if (!page.isClosed()) {
        await page.close().catch(() => {})
      }
      const idx = pooled.pages.indexOf(page)
      if (idx > -1) pooled.pages.splice(idx, 1)
      this.scheduleIdleCleanup()
    }

    return { page, release }
  }

  async getIsolatedPage(sourceId: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const browser = await chromium.launch({
      headless: this.options.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    })
    const profile = this.profileManager.getProfile(sourceId)
    const proxy = this.proxyManager?.getProxy()
    const context = await this.createContext(browser, profile, proxy)
    const page = await context.newPage()

    return {
      page,
      close: async () => {
        await context.close().catch(() => {})
        await browser.close().catch(() => {})
      },
    }
  }

  async close() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    await Promise.all(this.contexts.map(c => c.context.close().catch(() => {})))
    await Promise.all(
      Array.from(new Set(this.contexts.map(c => c.browser))).map(b => b.close().catch(() => {}))
    )
    this.contexts = []
  }

  getStats() {
    return {
      browsers: new Set(this.contexts.map(c => c.browser)).size,
      contexts: this.contexts.length,
      activePages: this.contexts.reduce((sum, c) => sum + c.pages.filter(p => !p.isClosed()).length, 0),
    }
  }

  private async acquireContext(sourceId: string): Promise<PooledContext> {
    const existing = this.contexts.find(c => c.sourceId === sourceId && c.pages.length < this.options.maxPagesPerContext)
    if (existing) {
      existing.lastUsedAt = Date.now()
      return existing
    }

    if (this.contexts.length >= this.options.maxContexts) {
      await this.evictOldestContext()
    }

    const browser = await this.getOrCreateBrowser()
    const profile = this.profileManager.getProfile(sourceId)
    const proxy = this.proxyManager?.getProxy()
    const context = await this.createContext(browser, profile, proxy)

    const pooled: PooledContext = {
      id: `${sourceId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      browser,
      context,
      profile,
      proxy,
      sourceId,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      pages: [],
    }
    this.contexts.push(pooled)
    return pooled
  }

  private async getOrCreateBrowser(): Promise<Browser> {
    const browsers = Array.from(new Set(this.contexts.map(c => c.browser)))
    if (browsers.length < this.options.maxBrowsers) {
      return chromium.launch({
        headless: this.options.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
        ],
      })
    }
    return browsers[browsers.length - 1]
  }

  private async createContext(browser: Browser, profile: BrowserProfile, proxy?: ProxyConfig): Promise<BrowserContext> {
    const context = await browser.newContext({
      userAgent: profile.userAgent,
      viewport: profile.viewport,
      screen: profile.screen,
      locale: profile.locale,
      timezoneId: profile.timezone,
      proxy: proxy ? {
        server: `${proxy.protocol}://${proxy.host}:${proxy.port}`,
        username: proxy.username,
        password: proxy.password,
      } : undefined,
      acceptDownloads: false,
    })
    await this.injectStealth(context, profile)
    return context
  }

  private async injectStealth(context: BrowserContext, profile: BrowserProfile) {
    await context.addInitScript((p: BrowserProfile) => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
      Object.defineProperty(navigator, 'languages', { get: () => [p.locale, 'en'] })
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => p.hardwareConcurrency })
      Object.defineProperty(navigator, 'deviceMemory', { get: () => p.deviceMemory })
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => p.maxTouchPoints })
      Object.defineProperty(navigator, 'platform', { get: () => p.platform })
      ;(window as any).chrome = { runtime: {} }
    }, profile)
  }

  private async trimOldestPage(pooled: PooledContext) {
    const oldest = pooled.pages.find(p => !p.isClosed())
    if (oldest) {
      await oldest.close().catch(() => {})
      const idx = pooled.pages.indexOf(oldest)
      if (idx > -1) pooled.pages.splice(idx, 1)
    }
  }

  private async evictOldestContext() {
    const oldest = this.contexts.reduce((a, b) => (a.lastUsedAt < b.lastUsedAt ? a : b))
    await this.closeContext(oldest)
  }

  private async closeContext(pooled: PooledContext) {
    await Promise.all(pooled.pages.map(p => p.close().catch(() => {})))
    await pooled.context.close().catch(() => {})
    const idx = this.contexts.indexOf(pooled)
    if (idx > -1) this.contexts.splice(idx, 1)
  }

  private scheduleIdleCleanup() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.cleanupIdle(), this.options.idleTimeoutMs)
  }

  private async cleanupIdle() {
    const now = Date.now()
    const idle = this.contexts.filter(c => c.pages.length === 0 && now - c.lastUsedAt > this.options.idleTimeoutMs)
    await Promise.all(idle.map(c => this.closeContext(c)))
  }
}
