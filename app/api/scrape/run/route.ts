// app/api/scrape/run/route.ts
// API endpoint to trigger scraper orchestration runs.

import { NextRequest, NextResponse } from 'next/server'
import { runScrapers, OrchestratorType } from '@/lib/scrapers/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Shared-secret gate, matching app/api/scrape/route.ts. Runs are heavy and can burn IPs, so this must
// never be public. Caller sends `Authorization: Bearer <SCRAPE_SECRET|CRON_SECRET>`. Secure-by-default:
// with no secret configured the endpoint is CLOSED in production (open in local dev).
function denyUnauthed(request: NextRequest): NextResponse | null {
  const secret = process.env.SCRAPE_SECRET || process.env.CRON_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production')
      return NextResponse.json(
        { error: 'Scrape endpoint disabled: set SCRAPE_SECRET or CRON_SECRET' },
        { status: 503 },
      )
    return null
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return null
}

export async function POST(request: NextRequest) {
  const denied = denyUnauthed(request)
  if (denied) return denied
  try {
    const body = await request.json()
    const orchestrator: OrchestratorType = body.orchestrator || 'concurrent'
    const sourceIds: string[] | undefined = body.sourceIds
    const concurrency: number = body.concurrency || 3
    const dryRun: boolean = body.dryRun || false

    const results = await runScrapers({
      orchestrator,
      sourceIds,
      concurrency,
      dryRun,
    })

    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      totalDeals: results.reduce((sum, r) => sum + r.dealsFound, 0),
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
      results,
    }

    return NextResponse.json(summary)
  } catch (error) {
    console.error('Scraper run failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scraper run failed' },
      { status: 500 }
    )
  }
}
