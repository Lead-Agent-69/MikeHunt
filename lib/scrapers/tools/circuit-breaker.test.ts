import { describe, it, expect } from 'vitest'
import { CircuitBreakerRegistry } from './circuit-breaker'

describe('CircuitBreakerRegistry', () => {
  it('starts closed and allows execution', () => {
    const breaker = new CircuitBreakerRegistry({ failureThreshold: 3, resetTimeoutMs: 1000 })
    const result = breaker.canExecute('source-a')
    expect(result.allowed).toBe(true)
    expect(result.state).toBe('closed')
  })

  it('opens after threshold failures', () => {
    const breaker = new CircuitBreakerRegistry({ failureThreshold: 3, resetTimeoutMs: 1000 })
    breaker.recordFailure('source-a')
    breaker.recordFailure('source-a')
    breaker.recordFailure('source-a')
    expect(breaker.canExecute('source-a').allowed).toBe(false)
    expect(breaker.canExecute('source-a').state).toBe('open')
  })

  it('transitions to half-open after reset timeout', async () => {
    const breaker = new CircuitBreakerRegistry({ failureThreshold: 2, resetTimeoutMs: 50 })
    breaker.recordFailure('source-a')
    breaker.recordFailure('source-a')
    expect(breaker.canExecute('source-a').allowed).toBe(false)
    await new Promise(r => setTimeout(r, 60))
    const halfOpen = breaker.canExecute('source-a')
    expect(halfOpen.allowed).toBe(true)
    expect(halfOpen.state).toBe('half-open')
  })

  it('closes on half-open success', () => {
    const breaker = new CircuitBreakerRegistry({ failureThreshold: 2, resetTimeoutMs: 50, halfOpenMaxAttempts: 1 })
    breaker.recordFailure('source-a')
    breaker.recordFailure('source-a')
    breaker.recordFailure('source-a')
    breaker.recordSuccess('source-a')
    expect(breaker.canExecute('source-a').state).toBe('open')
  })

  it('reopens on half-open failure', () => {
    const breaker = new CircuitBreakerRegistry({ failureThreshold: 2, resetTimeoutMs: 50, halfOpenMaxAttempts: 1 })
    breaker.recordFailure('source-a')
    breaker.recordFailure('source-a')
    breaker.recordSuccess('source-a')
    expect(breaker.canExecute('source-a').allowed).toBe(false)
  })
})
