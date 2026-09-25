// lib/scrapers/tools/auth-session.ts
// Reusable browser-based login + session cookie reuse for auth-required sources.
// Stores session state (cookies/storage) in the encrypted credential store so re-login is rare.

import { chromium, BrowserContext, Page } from 'playwright'
import { ScraperCredentialManager, ScraperCredentials } from './credentials'

export interface AuthSessionOptions {
  sourceId: string
  loginUrl: string
  usernameSelector: string
  passwordSelector: string
  submitSelector: string
  postLoginSelector?: string
  credentialManager?: ScraperCredentialManager
  headless?: boolean
}

export class AuthSessionManager {
  private options: AuthSessionOptions
  private credentials: ScraperCredentials | null = null
  private credentialManager: ScraperCredentialManager

  constructor(options: AuthSessionOptions) {
    this.options = options
    this.credentialManager = options.credentialManager || new ScraperCredentialManager()
  }

  async init(): Promise<void> {
    this.credentials = await this.credentialManager.getCredentials(this.options.sourceId)
  }

  hasCredentials(): boolean {
    return Boolean(this.credentials?.username && this.credentials?.password)
  }

  async getContext(): Promise<{ context: BrowserContext; page: Page; reused: boolean }> {
    const browser = await chromium.launch({ headless: this.options.headless ?? true })
    const context = await browser.newContext()
    let reused = false

    if (this.credentials?.cookies) {
      try {
        const cookies = JSON.parse(this.credentials.cookies)
        await context.addCookies(cookies)
        reused = true
      } catch (err) {
        console.warn(`[AuthSession] Failed to load cookies for ${this.options.sourceId}:`, err)
      }
    }

    if (this.credentials?.sessionStorage) {
      try {
        const storage = JSON.parse(this.credentials.sessionStorage)
        await context.addInitScript((state: any) => {
          for (const [key, value] of Object.entries(state)) {
            sessionStorage.setItem(key, value as string)
          }
        }, storage)
      } catch (err) {
        console.warn(`[AuthSession] Failed to load session storage for ${this.options.sourceId}:`, err)
      }
    }

    const page = await context.newPage()
    return { context, page, reused }
  }

  async loginIfNeeded(): Promise<BrowserContext> {
    await this.init()

    if (!this.hasCredentials()) {
      throw new Error(`No credentials configured for ${this.options.sourceId}`)
    }

    const { context, page, reused } = await this.getContext()

    // If cookies loaded, check if session is still valid by navigating to a protected page
    if (reused) {
      await page.goto(this.options.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      const stillLoggedIn = await page.locator(this.options.postLoginSelector || 'body').count().then(c => c > 0)
      // Heuristic: if post-login element is present, we're good. Otherwise re-login.
      if (stillLoggedIn && this.options.postLoginSelector && await page.locator(this.options.postLoginSelector).isVisible().catch(() => false)) {
        return context
      }
    }

    await this.performLogin(page)
    await this.saveSession(context)
    return context
  }

  private async performLogin(page: Page): Promise<void> {
    const { loginUrl, usernameSelector, passwordSelector, submitSelector, postLoginSelector } = this.options

    await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 60000 })
    await page.fill(usernameSelector, this.credentials!.username!)
    await page.fill(passwordSelector, this.credentials!.password!)

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => {}),
      page.click(submitSelector),
    ])

    if (postLoginSelector) {
      await page.waitForSelector(postLoginSelector, { timeout: 30000 }).catch(() => {
        console.warn(`[AuthSession] Post-login selector not found for ${this.options.sourceId}`)
      })
    }
  }

  private async saveSession(context: BrowserContext): Promise<void> {
    const cookies = await context.cookies()
    const sessionStorage = await context.pages()[0]?.evaluate(() => {
      const store = window.sessionStorage as any
      const state: Record<string, string> = {}
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i) as string
        if (key) state[key] = store.getItem(key) || ''
      }
      return state
    }) || {}

    await this.credentialManager.setCredentials(this.options.sourceId, {
      ...this.credentials,
      sourceId: this.options.sourceId,
      cookies: JSON.stringify(cookies),
      sessionStorage: JSON.stringify(sessionStorage),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
  }
}
