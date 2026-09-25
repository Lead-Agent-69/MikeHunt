// lib/scrapers/tools/proxy-manager.ts
// Advanced proxy manager with health checks, rotation, and geographic targeting.

import { FreeProxyProvider } from './free-proxy-provider'

export interface ProxyConfig {
  id: string
  host: string
  port: number
  protocol: 'http' | 'https' | 'socks5'
  username?: string
  password?: string
  country?: string
  state?: string
  city?: string
  type: 'residential' | 'datacenter' | 'mobile'
  priority?: number
}

export interface ProxyHealth {
  proxyId: string
  successCount: number
  failureCount: number
  avgResponseMs: number
  lastUsedAt?: Date
  lastFailedAt?: Date
  bannedUntil?: Date
  cooldownUntil?: Date
}

export class ProxyManager {
  private proxies: ProxyConfig[] = []
  private health: Map<string, ProxyHealth> = new Map()
  private currentIndex = 0
  private enabled = true

  constructor(proxies: ProxyConfig[] = []) {
    this.loadFromEnv()
    this.addProxies(proxies)
  }

  private loadFromEnv() {
    const envUrls = (process.env.PROXY_URLS || '').split(',').filter(Boolean)
    for (const url of envUrls) {
      try {
        const parsed = new URL(url)
        const protocol = parsed.protocol.replace(':', '') as ProxyConfig['protocol']
        this.proxies.push({
          id: `env-${this.proxies.length}`,
          host: parsed.hostname,
          port: parseInt(parsed.port || '80'),
          protocol,
          username: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password),
          type: 'datacenter',
        })
      } catch {
        // ignore invalid proxy URLs
      }
    }
  }

  addProxies(proxies: ProxyConfig[]) {
    this.proxies.push(...proxies)
    for (const proxy of proxies) {
      if (!this.health.has(proxy.id)) {
        this.health.set(proxy.id, { proxyId: proxy.id, successCount: 0, failureCount: 0, avgResponseMs: 0 })
      }
    }
  }

  getProxy(options?: {
    sourceType?: string
    sourceId?: string
    country?: string
    state?: string
    city?: string
    type?: ProxyConfig['type']
  }): ProxyConfig | undefined {
    if (!this.enabled || this.proxies.length === 0) return undefined

    const now = new Date()
    const available = this.proxies.filter(p => {
      const h = this.health.get(p.id)
      if (h?.bannedUntil && h.bannedUntil > now) return false
      if (h?.cooldownUntil && h.cooldownUntil > now) return false
      return true
    })

    const filtered = available.filter(p => {
      if (options?.country && p.country !== options.country) return false
      if (options?.state && p.state !== options.state) return false
      if (options?.city && p.city !== options.city) return false
      if (options?.type && p.type !== options.type) return false
      return true
    })

    const pool = filtered.length > 0 ? filtered : available
    if (pool.length === 0) return undefined

    // Round-robin with priority weighting
    const sorted = pool.sort((a, b) => (b.priority || 0) - (a.priority || 0))
    const proxy = sorted[this.currentIndex % sorted.length]
    this.currentIndex = (this.currentIndex + 1) % sorted.length

    const h = this.health.get(proxy.id)!
    h.lastUsedAt = now
    return proxy
  }

  markSuccess(proxyId: string, responseMs: number) {
    const h = this.health.get(proxyId)
    if (!h) return
    h.successCount += 1
    h.avgResponseMs = (h.avgResponseMs * (h.successCount - 1) + responseMs) / h.successCount
  }

  markFailure(proxyId: string, errorType: 'timeout' | 'blocked' | 'network' | 'rate_limit' | 'unknown' = 'unknown') {
    const h = this.health.get(proxyId)
    if (!h) return
    h.failureCount += 1
    h.lastFailedAt = new Date()

    const now = new Date()
    const cooldowns = {
      timeout: 30000,
      blocked: 300000,
      network: 15000,
      rate_limit: 600000,
      unknown: 30000,
    }

    const totalFailures = h.failureCount
    if (totalFailures >= 5) {
      h.bannedUntil = new Date(now.getTime() + cooldowns[errorType] * 2)
    } else {
      h.cooldownUntil = new Date(now.getTime() + cooldowns[errorType])
    }
  }

  getHealth(): ProxyHealth[] {
    return Array.from(this.health.values())
  }

  getBestProxy(): ProxyConfig | undefined {
    const sorted = this.getHealth()
      .filter(h => h.successCount > 0)
      .sort((a, b) => {
        const aScore = a.successCount / (a.successCount + a.failureCount) * (1 / (a.avgResponseMs + 1))
        const bScore = b.successCount / (b.successCount + b.failureCount) * (1 / (b.avgResponseMs + 1))
        return bScore - aScore
      })

    if (sorted.length === 0) return undefined
    return this.proxies.find(p => p.id === sorted[0].proxyId)
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }

  async loadFreeProxies(options?: import('./free-proxy-provider').FreeProxyProviderOptions): Promise<number> {
    const provider = new FreeProxyProvider(options)
    const proxies = await provider.fetchProxies()
    if (proxies.length) {
      this.addProxies(proxies)
      console.log(`[ProxyManager] Loaded ${proxies.length} free proxies`)
    }
    return proxies.length
  }
}
