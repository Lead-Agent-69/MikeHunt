import { describe, it, expect, vi } from 'vitest'
import { ScraperExecutor } from './executor'
import { ScraperRegistry } from './registry'

describe('ScraperExecutor', () => {
  it('executes a successful scraper and returns count', async () => {
    const executor = new ScraperExecutor()
    const scraper = new ScraperRegistry().register({
      id: 'success',
      name: 'Success',
      type: 'marketplace',
      priority: 'medium',
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => 42,
      enabled: true,
      estimatedDealsPerRun: 10,
    })

    const result = await executor.execute(scraper, { timeoutMs: 1000 })
    expect(result.success).toBe(true)
    expect(result.dealsFound).toBe(42)
    expect(result.dealsSaved).toBe(42)
  })

  it('returns error after exhausting retries', async () => {
    const executor = new ScraperExecutor()
    const scraper = new ScraperRegistry().register({
      id: 'failing',
      name: 'Failing',
      type: 'marketplace',
      priority: 'medium',
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => {
        throw new Error('network error')
      },
      enabled: true,
      estimatedDealsPerRun: 10,
    })

    const result = await executor.execute(scraper, { maxRetries: 1, retryDelayMs: 10, timeoutMs: 1000 })
    expect(result.success).toBe(false)
    expect(result.error).toContain('network error')
    expect(result.dealsFound).toBe(0)
  })

  it('respects abort signal', async () => {
    const executor = new ScraperExecutor()
    const scraper = new ScraperRegistry().register({
      id: 'slow',
      name: 'Slow',
      type: 'marketplace',
      priority: 'medium',
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => {
        await new Promise(resolve => setTimeout(resolve, 500))
        return 1
      },
      enabled: true,
      estimatedDealsPerRun: 10,
    })

    const controller = new AbortController()
    const promise = executor.execute(scraper, { abortSignal: controller.signal, timeoutMs: 2000 })
    controller.abort()

    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Aborted by user')
  })

  it('returns simulated count in dry run', async () => {
    const executor = new ScraperExecutor()
    const scraper = new ScraperRegistry().register({
      id: 'dry',
      name: 'Dry',
      type: 'marketplace',
      priority: 'medium',
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => 0,
      enabled: true,
      estimatedDealsPerRun: 50,
    })

    const result = await executor.execute(scraper, { dryRun: true })
    expect(result.success).toBe(true)
    expect(result.dealsFound).toBe(50)
  })

  it('enforces a cost guard deal budget', async () => {
    const executor = new ScraperExecutor()
    const scraper = new ScraperRegistry().register({
      id: 'budget',
      name: 'Budget',
      type: 'marketplace',
      priority: 'medium',
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => 100,
      enabled: true,
      estimatedDealsPerRun: 100,
    })

    const result = await executor.execute(scraper, {
      timeoutMs: 1000,
      costGuardOptions: { maxDealsPerRun: 5 },
    })
    expect(result.success).toBe(true)
    expect(result.dealsFound).toBeLessThanOrEqual(5)
  })
})
