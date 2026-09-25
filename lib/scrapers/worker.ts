// lib/scrapers/worker.ts
// Distributed queue worker entry point. Run this as a long-lived process.
//
// Usage:
//   npx ts-node lib/scrapers/worker.ts
//   node dist/lib/scrapers/worker.js
//
// Or programmatically:
//   import { startScraperWorker } from '@/lib/scrapers/worker'
//   const worker = await startScraperWorker({ workerConcurrency: 5 })
//   await worker.stop()

import { QueueOrchestrator } from './orchestrators/queue'
import { createScraperRegistry } from './runner'

export interface WorkerOptions {
  redisUrl?: string
  queueName?: string
  workerConcurrency?: number
  sourceIds?: string[]
  dryRun?: boolean
  maxRuntimeMinutes?: number
  maxRuns?: number
}

export interface ScraperWorker {
  stop: () => Promise<void>
  waitUntilStopped: () => Promise<void>
}

export async function startScraperWorker(options: WorkerOptions = {}): Promise<ScraperWorker> {
  const registry = createScraperRegistry()
  const orchestrator = new QueueOrchestrator(registry, {
    redisUrl: options.redisUrl,
    queueName: options.queueName,
    workerConcurrency: options.workerConcurrency || 3,
    dryRun: options.dryRun || false,
  })

  let stopped = false
  let runPromise: Promise<void> | null = null
  let timeoutHandle: NodeJS.Timeout | null = null

  const stop = async () => {
    if (stopped) return
    stopped = true
    if (timeoutHandle) clearTimeout(timeoutHandle)
    await orchestrator.stop()
  }

  const enqueue = async () => {
    const count = await orchestrator.enqueue(options.sourceIds)
    console.log(`[Worker] Enqueued ${count} jobs`)
    return count
  }

  // Optionally enqueue jobs before processing
  if (!options.sourceIds || options.sourceIds.length === 0 || options.sourceIds.length > 0) {
    await enqueue()
  }

  const startTime = Date.now()
  const maxRuntimeMs = options.maxRuntimeMinutes ? options.maxRuntimeMinutes * 60 * 1000 : undefined

  runPromise = (async () => {
    await orchestrator.run()
  })()

  // Optional runtime cap
  if (maxRuntimeMs) {
    timeoutHandle = setTimeout(() => {
      console.log(`[Worker] Max runtime reached (${options.maxRuntimeMinutes}m), stopping...`)
      stop()
    }, maxRuntimeMs)
  }

  // Optional max runs cap
  if (options.maxRuns) {
    let runs = 0
    const checkRuns = setInterval(() => {
      runs += 1
      if (runs >= options.maxRuns!) {
        clearInterval(checkRuns)
        console.log(`[Worker] Max runs reached (${options.maxRuns}), stopping...`)
        stop()
      }
    }, 1000)
  }

  // Graceful shutdown on SIGTERM / SIGINT
  const handleSignal = async (signal: string) => {
    console.log(`[Worker] Received ${signal}, stopping gracefully...`)
    await stop()
    process.exit(0)
  }

  process.on('SIGTERM', () => handleSignal('SIGTERM'))
  process.on('SIGINT', () => handleSignal('SIGINT'))

  return {
    stop,
    waitUntilStopped: async () => {
      if (runPromise) await runPromise
    },
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2)
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag)
    return idx > -1 ? args[idx + 1] : undefined
  }

  const hasFlag = (flag: string) => args.includes(flag)

  const sourceIds = getArg('--sources')?.split(',').filter(Boolean)
  const concurrency = parseInt(getArg('--concurrency') || '3', 10)
  const redisUrl = getArg('--redis-url') || process.env.REDIS_URL
  const queueName = getArg('--queue-name') || process.env.SCRAPER_QUEUE_NAME
  const dryRun = hasFlag('--dry-run')
  const maxRuntimeMinutes = getArg('--max-runtime-minutes')
    ? parseInt(getArg('--max-runtime-minutes')!, 10)
    : undefined

  const worker = await startScraperWorker({
    sourceIds,
    workerConcurrency: concurrency,
    redisUrl,
    queueName,
    dryRun,
    maxRuntimeMinutes,
  })

  console.log('[Worker] Started. Waiting for jobs...')
  await worker.waitUntilStopped()
  console.log('[Worker] Stopped.')
}

if (require.main === module) {
  main().catch(err => {
    console.error('[Worker] Fatal error:', err)
    process.exit(1)
  })
}
