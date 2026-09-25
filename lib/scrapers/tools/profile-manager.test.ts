import { describe, it, expect } from 'vitest'
import { ProfileManager } from './profile-manager'

describe('ProfileManager', () => {
  it('returns a consistent profile for the same source', () => {
    const manager = new ProfileManager({ seed: 'test-seed' })
    const a = manager.getProfile('source-a')
    const b = manager.getProfile('source-a')
    expect(a.userAgent).toBe(b.userAgent)
    expect(a.screen.width).toBe(b.screen.width)
    expect(a.timezone).toBe(b.timezone)
  })

  it('returns different profiles for different sources', () => {
    const manager = new ProfileManager({ seed: 'test-seed' })
    const a = manager.getProfile('source-a')
    const b = manager.getProfile('source-b')
    expect(a.userAgent).not.toBe(b.userAgent)
  })

  it('resets a profile on demand', () => {
    const manager = new ProfileManager({ seed: 'test-seed' })
    const a = manager.getProfile('source-a')
    const b = manager.resetProfile('source-a')
    expect(a.userAgent).not.toBe(b.userAgent)
  })

  it('includes required identity fields', () => {
    const profile = new ProfileManager().getProfile('x')
    expect(profile.userAgent).toContain('Chrome/')
    expect(profile.screen.width).toBeGreaterThan(0)
    expect(profile.locale).toBe('en-US')
    expect(profile.hardwareConcurrency).toBeGreaterThan(0)
    expect(profile.fonts.length).toBeGreaterThan(0)
  })
})
