// app/api/scrape/queue/route.ts
// Queue management API: enqueue, clear, and inspect jobs.

import { NextRequest, NextResponse } from 'next/server'
import { createScraperRegistry } from '@/lib/scrapers/runner'
import { QueueOrchestrator } from '@/lib/scrapers/orchestrators/queue'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const queueName = searchParams.get('queueName') || process.env.SCRAPER_QUEUE_NAME || undefined
    const redisUrl = searchParams.get('redisUrl') || process.env.REDIS_URL || undefined

    const registry = createScraperRegistry()
    const orchestrator = new QueueOrchestrator(registry, { queueName, redisUrl })

    const pending = await orchestrator.getQueueLength()
    const jobs = await orchestrator.getJobStatuses(100)

    await orchestrator.stop()

    return NextResponse.json({
      queueName: orchestrator.getQueueName(),
      pending,
      jobs,
    })
  } catch (error) {
    console.error('Queue GET failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Queue GET failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const queueName = body.queueName || process.env.SCRAPER_QUEUE_NAME || undefined
    const redisUrl = body.redisUrl || process.env.REDIS_URL || undefined
    const sourceIds: string[] | undefined = body.sourceIds

    const registry = createScraperRegistry()
    const orchestrator = new QueueOrchestrator(registry, { queueName, redisUrl })

    const enqueued = await orchestrator.enqueue(sourceIds)
    await orchestrator.stop()

    return NextResponse.json({
      enqueued,
      queueName: orchestrator.getQueueName(),
    })
  } catch (error) {
    console.error('Queue POST failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Queue POST failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const queueName = searchParams.get('queueName') || process.env.SCRAPER_QUEUE_NAME || undefined
    const redisUrl = searchParams.get('redisUrl') || process.env.REDIS_URL || undefined

    const registry = createScraperRegistry()
    const orchestrator = new QueueOrchestrator(registry, { queueName, redisUrl })
    await orchestrator.clearQueue()
    await orchestrator.stop()

    return NextResponse.json({ cleared: true, queueName: orchestrator.getQueueName() })
  } catch (error) {
    console.error('Queue DELETE failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Queue DELETE failed' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const action = searchParams.get('action') || 'retry'
    const queueName = searchParams.get('queueName') || process.env.SCRAPER_QUEUE_NAME || undefined
    const redisUrl = searchParams.get('redisUrl') || process.env.REDIS_URL || undefined
    const body = await request.json().catch(() => ({}))
    const limit = body.limit ? parseInt(body.limit, 10) : 10

    const registry = createScraperRegistry()
    const orchestrator = new QueueOrchestrator(registry, { queueName, redisUrl })

    if (action === 'retry') {
      const requeued = await orchestrator.retryDeadLetter(limit)
      await orchestrator.stop()
      return NextResponse.json({ requeued })
    }

    if (action === 'clear-dlq') {
      await orchestrator.clearDeadLetterQueue()
      await orchestrator.stop()
      return NextResponse.json({ cleared: true, dlq: orchestrator.getDeadLetterQueueName() })
    }

    if (action === 'deadletter') {
      const jobs = await orchestrator.getDeadLetterJobs(limit)
      await orchestrator.stop()
      return NextResponse.json({ dlq: orchestrator.getDeadLetterQueueName(), jobs })
    }

    await orchestrator.stop()
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Queue PATCH failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Queue PATCH failed' },
      { status: 500 }
    )
  }
}
