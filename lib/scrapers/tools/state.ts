// lib/scrapers/tools/state.ts
// Persist scraper registry state to Supabase and hydrate it on startup.

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { ScraperRegistry, RegisteredScraper } from './registry'

export interface StateManagerOptions {
  supabaseUrl?: string
  supabaseKey?: string
}

export class ScraperStateManager {
  private supabase: SupabaseClient

  constructor(options: StateManagerOptions = {}) {
    const supabaseUrl = options.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and key are required for ScraperStateManager')
    }
    this.supabase = createClient(supabaseUrl, supabaseKey)
  }

  async loadState(registry: ScraperRegistry): Promise<void> {
    const { data: states, error } = await this.supabase
      .from('scraper_state')
      .select('*')

    if (error) {
      console.error('[StateManager] Failed to load state:', error.message)
      return
    }

    for (const row of states || []) {
      const scraper = registry.get(row.source_id)
      if (!scraper) continue

      if (typeof row.enabled === 'boolean') scraper.enabled = row.enabled
      if (typeof row.consecutive_failures === 'number') scraper.consecutiveFailures = row.consecutive_failures
      if (typeof row.auto_disable_threshold === 'number') scraper.autoDisableThreshold = row.auto_disable_threshold
      if (row.last_run_at) scraper.lastRun = new Date(row.last_run_at)
      if (typeof row.run_count === 'number') scraper.runCount = row.run_count
      if (typeof row.success_rate === 'number') scraper.successRate = row.success_rate
      if (typeof row.average_duration_ms === 'number') scraper.averageDurationMs = row.average_duration_ms
      if (typeof row.estimated_deals_per_run === 'number') scraper.estimatedDealsPerRun = row.estimated_deals_per_run
    }

    console.log(`[StateManager] Hydrated ${states?.length || 0} source states`)
  }

  async saveState(registry: ScraperRegistry): Promise<void> {
    const rows = registry.getAll().map(s => this.toRow(s))

    const { error } = await this.supabase
      .from('scraper_state')
      .upsert(rows, { onConflict: 'source_id' })

    if (error) {
      console.error('[StateManager] Failed to save state:', error.message)
      throw new Error(`Failed to save scraper state: ${error.message}`)
    }
  }

  async saveSourceState(scraper: RegisteredScraper): Promise<void> {
    const { error } = await this.supabase
      .from('scraper_state')
      .upsert(this.toRow(scraper), { onConflict: 'source_id' })

    if (error) {
      console.error(`[StateManager] Failed to save state for ${scraper.id}:`, error.message)
    }
  }

  private toRow(s: RegisteredScraper) {
    return {
      source_id: s.id,
      enabled: s.enabled,
      consecutive_failures: s.consecutiveFailures,
      auto_disable_threshold: s.autoDisableThreshold,
      last_run_at: s.lastRun?.toISOString() || null,
      run_count: s.runCount,
      success_rate: s.successRate,
      average_duration_ms: s.averageDurationMs,
      estimated_deals_per_run: s.estimatedDealsPerRun,
      updated_at: new Date().toISOString(),
    }
  }
}
