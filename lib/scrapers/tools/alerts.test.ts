import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ScraperAlertService } from './alerts'

describe('ScraperAlertService', () => {
  const originalEnv = { ...process.env }

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-key'
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('constructs with env variables', () => {
    const service = new ScraperAlertService()
    expect(service).toBeDefined()
  })

  it('throws when env variables are missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(() => new ScraperAlertService()).toThrow('Supabase URL and key are required')
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-key'
  })
})
