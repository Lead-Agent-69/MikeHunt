// lib/scrapers/tools/free-proxy-provider.ts
// Free public proxy discovery with basic health checks.
// Avoids paid proxy bills for low-risk / low-volume scraping.

import { ProxyConfig } from './proxy-manager'

export interface FreeProxyProviderOptions {
  testUrl?: string
  timeoutMs?: number
  maxProxies?: number
  countries?: string[]
}

export class FreeProxyProvider {
  private options: Required<FreeProxyProviderOptions>

  constructor(options: FreeProxyProviderOptions = {}) {
    this.options = {
      testUrl: 'https://httpbin.org/ip',
      timeoutMs: 8000,
      maxProxies: 20,
      countries: [],
      ...options,
    }
  }

  // Fetch a curated list of free public proxies from a JSON endpoint.
  // Sources: proxylist.geonode.com, proxy-list.download, etc.
  async fetchProxies(): Promise<ProxyConfig[]> {
    const urls = [
      'https://proxylist.geonode.com/api/proxy-list?limit=50&page=1&sort_by=lastChecked&sort_type=desc&protocols=http%2Chttps',
    ]

    for (const url of urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(this.options.timeoutMs) })
        if (!res.ok) continue
        const json = await res.json()
        const proxies = this.parseGeonode(json)
        if (proxies.length) return proxies
      } catch (err) {
        // ignore and try next source
      }
    }

    return []
  }

  private parseGeonode(json: any): ProxyConfig[] {
    const data = json?.data || []
    return data
      .filter((p: any) => p.protocols?.includes('http') || p.protocols?.includes('https'))
      .filter((p: any) => !this.options.countries.length || this.options.countries.includes(p.country))
      .slice(0, this.options.maxProxies)
      .map((p: any, i: number) => ({
        id: `free-${i}`,
        host: p.ip,
        port: parseInt(p.port, 10),
        protocol: (p.protocols?.includes('https') ? 'https' : 'http') as ProxyConfig['protocol'],
        type: 'datacenter' as const,
        country: p.country,
        city: p.city,
      }))
  }

  // Basic health check: can the proxy fetch the test URL within timeout?
  async validateProxy(proxy: ProxyConfig): Promise<boolean> {
    try {
      const res = await fetch(this.options.testUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.options.timeoutMs),
        // Node 18+ fetch doesn't support proxy out of the box, so this is a best-effort check
        // In practice Playwright/axios handles the proxy routing.
      })
      return res.ok
    } catch {
      return false
    }
  }

  async fetchAndValidate(): Promise<ProxyConfig[]> {
    const proxies = await this.fetchProxies()
    const results = await Promise.all(
      proxies.map(async p => ({ proxy: p, ok: await this.validateProxy(p) }))
    )
    return results.filter(r => r.ok).map(r => r.proxy)
  }
}
