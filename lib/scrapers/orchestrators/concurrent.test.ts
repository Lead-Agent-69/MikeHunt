import { describe, it, expect, vi } from 'vitest'
import { ScraperRegistry } from '../tools/registry'
import { ScraperExecutor } from '../tools/executor'
import { ConcurrentOrchestrator } from './concurrent'

describe('ConcurrentOrchestrator', () => {
  it('runs all enabled sources concurrently', async () => {
    const registry = new ScraperRegistry()
    registry.register({
      id: 'one',
      name: 'One',
      type: 'marketplace',
      priority: 'medium',
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => 10,
      enabled: true,
      estimatedDealsPerRun: 10,
    })
    registry.register({
      id: 'two',
      name: 'Two',
      type: 'marketplace',
      priority: 'medium',
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => 20,
      enabled: true,
      estimatedDealsPerRun: 20,
    })
    registry.register({
      id: 'disabled',
      name: 'Disabled',
      type: 'marketplace',
      priority: 'medium',
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => 5,
      enabled: false,
      estimatedDealsPerRun: 5,
    })

    const orchestrator = new ConcurrentOrchestrator(registry, {
      dryRun: true,
      logToConsole: false,
      concurrency: 2,
    })

    const results = await orchestrator.run()
    expect(results).toHaveLength(2)
    expect(results.map(r => r.source).sort()).toEqual(['one', 'two'])
    expect(results.every(r => r.success)).toBe(true)
    expect(results.find(r => r.source === 'one')?.dealsFound).toBe(10)
    expect(results.find(r => r.source === 'two')?.dealsFound).toBe(20)
  })

  it('records failures and tracks consecutive failures', async () => {
    const registry = new ScraperRegistry()
    registry.register({
      id: 'failing',
      name: 'Failing',
      type: 'marketplace',
      priority: 'medium',
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => {
        throw new Error('boom')
      },
      enabled: true,
      estimatedDealsPerRun: 10,
      autoDisableThreshold: 1,
    })

    const executor = new ScraperExecutor()
    const result = await executor.execute(registry.get('failing')!, { maxRetries: 0, timeoutMs: 1000 })

    await registry.updateStats('failing', result.success, result.durationMs, result.dealsFound)

    expect(result.success).toBe(false)
    expect(result.error).toContain('boom')
    expect(registry.get('failing')?.consecutiveFailures).toBe(1)
    expect(registry.get('failing')?.enabled).toBe(false)
  })

  it('emits progress events', async () => {
    const registry = new ScraperRegistry()
    registry.register({
      id: 'p1',
      name: 'P1',
      type: 'marketplace',
      priority: 'medium',
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      fn: async () => 1,
      enabled: true,
      estimatedDealsPerRun: 1,
    })

    const onProgress = vi.fn()
    const orchestrator = new ConcurrentOrchestrator(registry, {
      dryRun: true,
      logToConsole: false,
      onProgress,
    })

    await orchestrator.run()
    expect(onProgress).toHaveBeenCalled()
    const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0]
    expect(lastCall.completed).toBe(1)
    expect(lastCall.status).toBe('completed')
  })
})
