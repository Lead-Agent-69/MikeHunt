// app/api/scrape/registry/route.ts
// Manage scraper registry state: list sources, auto-disabled sources, enable/disable, reset failures.

import { NextRequest, NextResponse } from 'next/server'
import { createScraperRegistry } from '@/lib/scrapers/runner'
import { ScraperStateManager } from '@/lib/scrapers/tools/state'

function createRegistry() {
  const stateManager = new ScraperStateManager()
  const registry = createScraperRegistry(stateManager)
  return { registry, stateManager }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const filter = searchParams.get('filter') || 'all' // all | enabled | disabled | auto-disabled

    const { registry } = createRegistry()
    await registry.loadState()
    const all = registry.getAll().map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      priority: s.priority,
      frequencyMinutes: s.frequencyMinutes,
      enabled: s.enabled,
      requiresAuth: s.requiresAuth,
      stealthRequired: s.stealthRequired,
      runCount: s.runCount,
      successRate: s.successRate,
      consecutiveFailures: s.consecutiveFailures,
      autoDisableThreshold: s.autoDisableThreshold,
      lastRun: s.lastRun?.toISOString(),
      averageDurationMs: s.averageDurationMs,
      estimatedDealsPerRun: s.estimatedDealsPerRun,
    }))

    let sources = all
    if (filter === 'enabled') sources = all.filter(s => s.enabled)
    if (filter === 'disabled') sources = all.filter(s => !s.enabled)
    if (filter === 'auto-disabled') sources = all.filter(s => !s.enabled && s.consecutiveFailures > 0)

    return NextResponse.json({ sources, count: sources.length })
  } catch (error) {
    console.error('Registry GET failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Registry GET failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, action } = body

    if (!id || !action) {
      return NextResponse.json({ error: 'Missing id or action' }, { status: 400 })
    }

    const { registry } = createRegistry()
    await registry.loadState()
    const scraper = registry.get(id)
    if (!scraper) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 })
    }

    if (action === 'enable') {
      registry.setEnabled(id, true)
      registry.resetConsecutiveFailures(id)
    } else if (action === 'disable') {
      registry.setEnabled(id, false)
    } else if (action === 'reset') {
      registry.resetConsecutiveFailures(id)
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    await registry.persistState(id)

    return NextResponse.json({
      id,
      action,
      enabled: registry.get(id)?.enabled,
      consecutiveFailures: registry.get(id)?.consecutiveFailures,
    })
  } catch (error) {
    console.error('Registry POST failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Registry POST failed' },
      { status: 500 }
    )
  }
}
