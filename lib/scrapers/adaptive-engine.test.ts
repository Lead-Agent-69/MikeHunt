import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AdaptiveEngine } from './adaptive-engine'

function createMockBrowserPool() {
  return {
    getPage: vi.fn().mockRejectedValue(new Error('Browser pool unavailable in unit tests')),
    close: vi.fn().mockResolvedValue(undefined),
  } as any
}

describe('AdaptiveEngine', () => {
  let engine: AdaptiveEngine

  beforeEach(() => {
    engine = new AdaptiveEngine({ maxBrowserPages: 2, browserPool: createMockBrowserPool() })
  })

  afterEach(async () => {
    await engine.close()
    vi.restoreAllMocks()
  })

  it('uses static mode for simple HTML', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html><body><h1>Hello</h1><div class="item">car</div><p>' + 'x'.repeat(300) + '</p></body></html>',
    } as Response)

    const result = await engine.fetch('https://example.com/page', {
      name: 'test',
      baseUrl: 'https://example.com',
      renderMode: 'adaptive',
      requestDelay: 0,
      concurrency: 1,
      useProxies: false,
      stealth: true,
      maxPages: 1,
    })

    expect(result.mode).toBe('static')
    expect(result.$('h1').text()).toBe('Hello')
    expect(engine.getHostModeCache()['example.com']).toBe('static')
    await result.close()
  })

  it('escalates to browser when static returns blocked text', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html><body>Please wait while we verify you are human. Cloudflare protection.</body></html>',
    } as Response)

    await expect(engine.fetch('https://example.com/page', {
      name: 'test',
      baseUrl: 'https://example.com',
      renderMode: 'adaptive',
      requestDelay: 0,
      concurrency: 1,
      useProxies: false,
      stealth: true,
      maxPages: 1,
    })).rejects.toThrow()

    expect(engine.getHostModeCache()['example.com']).toBe('browser')
  })

  it('skips static when host is already known to need browser', async () => {
    const cache = engine.getHostModeCache()
    cache['example.com'] = 'browser'

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html><body><h1>Hello</h1></body></html>',
    } as Response)
    globalThis.fetch = mockFetch

    await expect(engine.fetch('https://example.com/page', {
      name: 'test',
      baseUrl: 'https://example.com',
      renderMode: 'adaptive',
      requestDelay: 0,
      concurrency: 1,
      useProxies: false,
      stealth: true,
      maxPages: 1,
    })).rejects.toThrow()
  })
})
