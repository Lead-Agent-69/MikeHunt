import { describe, it, expect, beforeEach } from 'vitest'
import { ScraperRegistry } from './registry'

describe('ScraperRegistry', () => {
  let registry: ScraperRegistry

  beforeEach(() => {
    registry = new ScraperRegistry()
    registry.register({
      id: 'test_source',
      name: 'Test Source',
      type: 'marketplace',
      priority: 'medium',
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => 10,
      enabled: true,
      estimatedDealsPerRun: 10,
    })
  })

  it('registers and retrieves a scraper', () => {
    const scraper = registry.get('test_source')
    expect(scraper).toBeDefined()
    expect(scraper?.name).toBe('Test Source')
  })

  it('tracks successful stats', async () => {
    await registry.updateStats('test_source', true, 1000, 25)
    const scraper = registry.get('test_source')!
    expect(scraper.runCount).toBe(1)
    expect(scraper.successRate).toBe(1)
    expect(scraper.consecutiveFailures).toBe(0)
    expect(scraper.averageDurationMs).toBe(1000)
    expect(scraper.estimatedDealsPerRun).toBe(25)
  })

  it('tracks failures and auto-disables after threshold', async () => {
    const scraper = registry.get('test_source')!
    scraper.autoDisableThreshold = 3

    for (let i = 0; i < 3; i++) {
      await registry.updateStats('test_source', false, 500, 0)
    }

    expect(scraper.consecutiveFailures).toBe(3)
    expect(scraper.enabled).toBe(false)
  })

  it('resets consecutive failures on success', async () => {
    const scraper = registry.get('test_source')!
    scraper.autoDisableThreshold = 3
    await registry.updateStats('test_source', false, 500, 0)
    await registry.updateStats('test_source', false, 500, 0)
    await registry.updateStats('test_source', true, 1000, 10)

    expect(scraper.consecutiveFailures).toBe(0)
    expect(scraper.enabled).toBe(true)
  })

  it('lists auto-disabled sources', async () => {
    const scraper = registry.get('test_source')!
    scraper.autoDisableThreshold = 2
    await registry.updateStats('test_source', false, 500, 0)
    await registry.updateStats('test_source', false, 500, 0)

    const autoDisabled = registry.getAutoDisabled()
    expect(autoDisabled).toHaveLength(1)
    expect(autoDisabled[0].id).toBe('test_source')
  })

  it('sorts by priority and expected value', () => {
    registry.register({
      id: 'high_priority',
      name: 'High Priority',
      type: 'auction',
      priority: 'high',
      frequencyMinutes: 30,
      requiresAuth: true,
      stealthRequired: true,
      fn: async () => 50,
      enabled: true,
      estimatedDealsPerRun: 100,
    })

    const sorted = registry.sortByPriority(registry.getAll())
    expect(sorted[0].id).toBe('high_priority')
    expect(sorted[1].id).toBe('test_source')
  })
})
