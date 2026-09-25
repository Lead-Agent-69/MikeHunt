import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ScraperCredentialManager } from './credentials'

describe('ScraperCredentialManager', () => {
  const originalEnv = { ...process.env }

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-key'
    process.env.SCRAPER_CREDENTIAL_ENCRYPTION_KEY = 'a'.repeat(32)
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('constructs with env variables', () => {
    const manager = new ScraperCredentialManager()
    expect(manager).toBeDefined()
  })

  it('throws when env variables are missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(() => new ScraperCredentialManager()).toThrow('Supabase URL and key are required')
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-key'
  })
})
