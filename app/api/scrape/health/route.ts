// app/api/scrape/health/route.ts
// Health dashboard API: source status, last run, failure rate, registry stats.

import { NextResponse } from 'next/server'
import { createScraperRegistry } from '@/lib/scrapers/runner'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    const registry = createScraperRegistry()
    const sources = registry.getAll()

    const sourceIds = sources.map(s => s.id)
    const { data: recentRuns, error } = await supabase
      .from('scraper_runs')
      .select('source, status, completed_at, error_message, deals_found, duration_ms')
      .in('source', sourceIds)
      .order('completed_at', { ascending: false })
      .limit(1000)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const runsBySource: Record<string, typeof recentRuns> = {}
    for (const run of recentRuns || []) {
      if (!runsBySource[run.source]) runsBySource[run.source] = []
      runsBySource[run.source].push(run)
    }

    const health = sources.map(source => {
      const runs = runsBySource[source.id] || []
      const lastRun = runs[0]
      const totalRuns = runs.length
      const failedRuns = runs.filter(r => r.status === 'error').length
      const successRate = totalRuns > 0 ? Math.round(((totalRuns - failedRuns) / totalRuns) * 100) : 100
      const lastRunAt = lastRun?.completed_at ? new Date(lastRun.completed_at).toISOString() : null
      const minutesSinceLastRun = lastRunAt
        ? Math.round((Date.now() - new Date(lastRunAt).getTime()) / 1000 / 60)
        : null

      return {
        id: source.id,
        name: source.name,
        type: source.type,
        priority: source.priority,
        enabled: source.enabled,
        frequencyMinutes: source.frequencyMinutes,
        isDue: !minutesSinceLastRun || minutesSinceLastRun >= source.frequencyMinutes,
        lastRunAt,
        lastStatus: lastRun?.status || 'never_run',
        lastError: lastRun?.error_message || null,
        totalRuns,
        failedRuns,
        successRate,
        estimatedDealsPerRun: source.estimatedDealsPerRun,
      }
    })

    return NextResponse.json({
      total: sources.length,
      enabled: sources.filter(s => s.enabled).length,
      due: health.filter(h => h.isDue).length,
      healthy: health.filter(h => h.successRate >= 80).length,
      sources: health,
    })
  } catch (error) {
    console.error('Health check failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Health check failed' },
      { status: 500 }
    )
  }
}
