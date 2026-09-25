// lib/scrapers/tools/profile-manager.ts
// Consistent browser identity profiles per source. Reusing the same profile
// lowers anti-bot signals compared to randomizing every request.

export interface BrowserProfile {
  id: string
  sourceId: string
  userAgent: string
  screen: { width: number; height: number; deviceScaleFactor: number; colorDepth: number }
  viewport: { width: number; height: number }
  locale: string
  timezone: string
  platform: string
  os: string
  fonts: string[]
  colorGamut: string
  hardwareConcurrency: number
  deviceMemory: number
  maxTouchPoints: number
}

export interface ProfileManagerOptions {
  /** Optional seed to make profiles deterministic across restarts */
  seed?: string
}

export class ProfileManager {
  private profiles: Map<string, BrowserProfile> = new Map()
  private resetCounts: Map<string, number> = new Map()
  private options: ProfileManagerOptions

  constructor(options: ProfileManagerOptions = {}) {
    this.options = options
  }

  getProfile(sourceId: string): BrowserProfile {
    if (!this.profiles.has(sourceId)) {
      this.profiles.set(sourceId, this.generateProfile(sourceId))
    }
    return this.profiles.get(sourceId)!
  }

  resetProfile(sourceId: string): BrowserProfile {
    const count = (this.resetCounts.get(sourceId) || 0) + 1
    this.resetCounts.set(sourceId, count)
    const profile = this.generateProfile(sourceId, count)
    this.profiles.set(sourceId, profile)
    return profile
  }

  private generateProfile(sourceId: string, resetCount = 0): BrowserProfile {
    const seed = this.options.seed ? `${this.options.seed}-${sourceId}` : sourceId
    const rng = this.seededRandom(`${seed}-reset-${resetCount}`)

    const platforms = ['Windows', 'macOS', 'Linux']
    const platform = platforms[Math.floor(rng() * platforms.length)]
    const os = this.pickOs(platform, rng)
    const chromeVersion = this.pickChromeVersion(rng)
    const screen = this.pickScreen(rng)

    return {
      id: `${sourceId}-${Date.now()}`,
      sourceId,
      userAgent: this.buildUserAgent(platform, os, chromeVersion, rng),
      screen,
      viewport: {
        width: Math.min(screen.width, 1400),
        height: Math.min(screen.height, 900),
      },
      locale: 'en-US',
      timezone: this.pickTimezone(rng),
      platform: platform === 'macOS' ? 'MacIntel' : platform === 'Windows' ? 'Win32' : 'Linux x86_64',
      os,
      fonts: this.pickFonts(platform, rng),
      colorGamut: 'srgb',
      hardwareConcurrency: [4, 8, 12][Math.floor(rng() * 3)],
      deviceMemory: [4, 8, 16][Math.floor(rng() * 3)],
      maxTouchPoints: 0,
    }
  }

  private seededRandom(seed: string): () => number {
    let h = 0
    for (let i = 0; i < seed.length; i++) {
      h = (h << 5) - h + seed.charCodeAt(i)
      h |= 0
    }
    return () => {
      h = Math.abs(h * 9301 + 49297) % 233280
      return h / 233280
    }
  }

  private pickOs(platform: string, rng: () => number): string {
    if (platform === 'Windows') return `Windows NT 10.0; Win64; x64 (build ${19000 + Math.floor(rng() * 5000)})`
    if (platform === 'macOS') return `Macintosh; Intel Mac OS X 10_${15 + Math.floor(rng() * 4)}_${1 + Math.floor(rng() * 9)}`
    return `X11; Linux x86_64`
  }

  private pickChromeVersion(rng: () => number): string {
    const major = 124 + Math.floor(rng() * 10)
    return `${major}.0.0.0`
  }

  private buildUserAgent(platform: string, os: string, chromeVersion: string, rng: () => number): string {
    const safari = `537.36${Math.floor(rng() * 10)}`
    return `Mozilla/5.0 (${os}) AppleWebKit/${safari.substring(0, 6)} (KHTML, like Gecko) Chrome/${chromeVersion} Safari/${safari.substring(0, 6)}`
  }

  private pickScreen(rng: () => number): BrowserProfile['screen'] {
    const screens = [
      { width: 1920, height: 1080, deviceScaleFactor: 1, colorDepth: 24 },
      { width: 2560, height: 1440, deviceScaleFactor: 1.5, colorDepth: 24 },
      { width: 1366, height: 768, deviceScaleFactor: 1, colorDepth: 24 },
      { width: 1440, height: 900, deviceScaleFactor: 2, colorDepth: 24 },
      { width: 3840, height: 2160, deviceScaleFactor: 1, colorDepth: 24 },
    ]
    return screens[Math.floor(rng() * screens.length)]
  }

  private pickTimezone(rng: () => number): string {
    const zones = [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Phoenix',
      'America/Detroit',
    ]
    return zones[Math.floor(rng() * zones.length)]
  }

  private pickFonts(platform: string, rng: () => number): string[] {
    const base = ['Arial', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Impact']
    if (platform === 'Windows') {
      return [...base, 'Segoe UI', 'Calibri', 'Consolas', 'Tahoma']
    }
    if (platform === 'macOS') {
      return [...base, 'Helvetica Neue', 'SF Pro', 'Menlo', 'Monaco']
    }
    return [...base, 'DejaVu Sans', 'Liberation Sans', 'Ubuntu']
  }

  getAllProfiles(): Record<string, BrowserProfile> {
    return Object.fromEntries(this.profiles)
  }
}
