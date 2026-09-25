import { describe, it, expect } from 'vitest'
import { BrowserPoolManager } from './browser-pool'

describe('BrowserPoolManager', () => {
  it('constructs with defaults and exposes stats', () => {
    const pool = new BrowserPoolManager()
    expect(pool).toBeDefined()
    expect(pool.getStats()).toEqual({ browsers: 0, contexts: 0, activePages: 0 })
  })

  it('constructs with custom options', () => {
    const pool = new BrowserPoolManager({ maxBrowsers: 1, maxContexts: 2, maxPagesPerContext: 1 })
    expect(pool.getStats()).toEqual({ browsers: 0, contexts: 0, activePages: 0 })
  })
})
