import { describe, it, expect } from 'vitest'
import { FlareSolverrClient } from './flaresolverr'

describe('FlareSolverrClient', () => {
  it('reports unconfigured when URL is missing', () => {
    const client = new FlareSolverrClient('')
    expect(client.isConfigured()).toBe(false)
  })

  it('reports configured when URL is present', () => {
    const client = new FlareSolverrClient('http://localhost:8191')
    expect(client.isConfigured()).toBe(true)
  })
})
