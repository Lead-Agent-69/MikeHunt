// lib/scrapers/scheduler.ts
// Scheduler service that decides which orchestrator to run and which sources are due.

import {
  SequentialOrchestrator,
  ConcurrentOrchestrator,
  PriorityOrchestrator,
  QueueOrchestrator,
  RealtimeOrchestrator,
} from './orchestrators'
import { createScraperRegistry, OrchestratorType } from './runner'
import { ScraperStateManager } from './tools/state'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export interface SchedulerOptions {
  mode?: OrchestratorType
  concurrency?: number
  redisUrl?: string
  queueName?: string
  dryRun?: boolean
  sourceIds?: string[]
  minIntervalMinutes?: number
  maxDurationMinutes?: number
  supabaseUrl?: string
  supabaseKey?: string
  onSchedule?: (sourceIds: string[], nextRunAt: Date) => void
}

export interface ScheduleResult {
  started: boolean
  sourceIds: string[]
  mode: OrchestratorType
  nextRunAt: Date
  reason?: string
}

export class ScraperScheduler {
  private options: SchedulerOptions
  private supabase: SupabaseClient
  private isRunning = false
  private intervalHandle: NodeJS.Timeout | null = null
  private lastRunAt: Date | null = null

  constructor(options: SchedulerOptions = {}) {
    this.options = {
      mode: 'concurrent',
      concurrency: 3,
      minIntervalMinutes: 5,
      ...options,
    }

    const supabaseUrl = this.options.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseKey = this.options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    this.supabase = createClient(supabaseUrl, supabaseKey)
  }

  // Determine which sources are due based on their frequency and last run
  async getDueSources(): Promise<string[]> {
    const stateManager = new ScraperStateManager({
      supabaseUrl: this.options.supabaseUrl,
      supabaseKey: this.options.supabaseKey,
    })
    const registry = createScraperRegistry(stateManager)
    await registry.loadState()
    const allSources = registry.getAll()

    // Get last run times from DB
    const sourceIds = allSources.map(s => s.id)
    const { data: runs } = await this.supabase
      .from('scraper_runs')
      .select('source, completed_at')
      .in('source', sourceIds)
      .order('completed_at', { ascending: false })

    const lastRunBySource: Record<string, Date> = {}
    for (const run of runs || []) {
      if (!lastRunBySource[run.source] && run.completed_at) {
        lastRunBySource[run.source] = new Date(run.completed_at)
      }
    }

    const dueSources: string[] = []
    for (const source of allSources) {
      if (!source.enabled) continue
      if (this.options.sourceIds && !this.options.sourceIds.includes(source.id)) continue

      const lastRun = lastRunBySource[source.id]
      if (!lastRun) {
        dueSources.push(source.id)
        continue
      }

      const minutesSinceLastRun = (Date.now() - lastRun.getTime()) / 1000 / 60
      if (minutesSinceLastRun >= (source.frequencyMinutes || 60)) {
        dueSources.push(source.id)
      }
    }

    return dueSources
  }

  // Run the scheduler once
  async runOnce(): Promise<ScheduleResult> {
    const now = new Date()
    if (this.lastRunAt) {
      const minutesSinceLastRun = (now.getTime() - this.lastRunAt.getTime()) / 1000 / 60
      if (minutesSinceLastRun < (this.options.minIntervalMinutes || 0)) {
        return {
          started: false,
          sourceIds: [],
          mode: this.options.mode!,
          nextRunAt: this.nextRunAt(),
          reason: 'Too soon since last run',
        }
      }
    }

    const dueSources = await this.getDueSources()
    if (dueSources.length === 0) {
      return {
        started: false,
        sourceIds: [],
        mode: this.options.mode!,
        nextRunAt: this.nextRunAt(),
        reason: 'No sources due',
      }
    }

    this.lastRunAt = now
    this.options.onSchedule?.(dueSources, this.nextRunAt())

    await this.execute(dueSources)

    return {
      started: true,
      sourceIds: dueSources,
      mode: this.options.mode!,
      nextRunAt: this.nextRunAt(),
    }
  }

  // Start a continuous loop
  async start(): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true

    // Run immediately once
    await this.runOnce()

    // Then check every minute
    this.intervalHandle = setInterval(async () => {
      if (!this.isRunning) return
      await this.runOnce()
    }, 60 * 1000)
  }

  async stop(): Promise<void> {
    this.isRunning = false
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
  }

  private async execute(sourceIds: string[]) {
    const stateManager = new ScraperStateManager({
      supabaseUrl: this.options.supabaseUrl,
      supabaseKey: this.options.supabaseKey,
    })
    const registry = createScraperRegistry(stateManager)
    await registry.loadState()
    const baseOptions = {
      logToConsole: true,
      dryRun: this.options.dryRun || false,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }

    switch (this.options.mode) {
      case 'sequential': {
        const orchestrator = new SequentialOrchestrator(registry, baseOptions)
        await orchestrator.run(sourceIds)
        break
      }
      case 'concurrent': {
        const orchestrator = new ConcurrentOrchestrator(registry, {
          ...baseOptions,
          concurrency: this.options.concurrency,
        })
        await orchestrator.run(sourceIds)
        break
      }
      case 'priority': {
        const orchestrator = new PriorityOrchestrator(registry, {
          ...baseOptions,
          concurrencyPerPriority: this.options.concurrency,
        })
        await orchestrator.run(sourceIds)
        break
      }
      case 'queue': {
        const orchestrator = new QueueOrchestrator(registry, {
          ...baseOptions,
          redisUrl: this.options.redisUrl,
          queueName: this.options.queueName,
          workerConcurrency: this.options.concurrency,
        })
        await orchestrator.enqueue(sourceIds)
        await orchestrator.run()
        await orchestrator.stop()
        break
      }
      case 'realtime': {
        const orchestrator = new RealtimeOrchestrator(registry, {
          ...baseOptions,
          concurrency: this.options.concurrency,
          maxContinuousRuns: 1,
        })
        await orchestrator.run(sourceIds)
        break
      }
      default:
        throw new Error(`Unknown scheduler mode: ${this.options.mode}`)
    }
  }

  private nextRunAt(): Date {
    return new Date(Date.now() + (this.options.minIntervalMinutes || 5) * 60 * 1000)
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2)
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag)
    return idx > -1 ? args[idx + 1] : undefined
  }

  const mode = (getArg('--mode') || 'concurrent') as OrchestratorType
  const concurrency = parseInt(getArg('--concurrency') || '3', 10)
  const redisUrl = getArg('--redis-url') || process.env.REDIS_URL
  const queueName = getArg('--queue-name') || process.env.SCRAPER_QUEUE_NAME
  const dryRun = args.includes('--dry-run')
  const sourceIds = getArg('--sources')?.split(',').filter(Boolean)
  const minIntervalMinutes = parseInt(getArg('--min-interval-minutes') || '5', 10)

  const scheduler = new ScraperScheduler({
    mode,
    concurrency,
    redisUrl,
    queueName,
    dryRun,
    sourceIds,
    minIntervalMinutes,
    onSchedule: (ids, next) => {
      console.log(`[Scheduler] ${ids.length} sources due. Next check at ${next.toISOString()}`)
    },
  })

  console.log(`[Scheduler] Starting in ${mode} mode...`)
  await scheduler.start()

  process.on('SIGTERM', async () => {
    console.log('[Scheduler] SIGTERM received, stopping...')
    await scheduler.stop()
    process.exit(0)
  })
  process.on('SIGINT', async () => {
    console.log('[Scheduler] SIGINT received, stopping...')
    await scheduler.stop()
    process.exit(0)
  })
}

if (require.main === module) {
  main().catch(err => {
    console.error('[Scheduler] Fatal error:', err)
    process.exit(1)
  })
}
