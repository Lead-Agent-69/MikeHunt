// lib/scrapers/orchestrators/queue.ts
// Queue-based orchestrator using Redis for durable, distributed scraping jobs.

import { BaseScraperOrchestrator, OrchestratorOptions } from './base'
import { ScrapeResult } from '@/types'
import { ScraperRegistry, RegisteredScraper } from '../tools/registry'
import { ScraperExecutor } from '../tools/executor'
import Redis from 'ioredis'

export interface QueueOrchestratorOptions extends OrchestratorOptions {
  redisUrl?: string
  queueName?: string
  workerConcurrency?: number
  retries?: number
  jobTimeoutMs?: number
  maxAttempts?: number
}

export interface ScrapeJob {
  id: string
  sourceId: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  attempts: number
  maxAttempts: number
  error?: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  dealsFound?: number
  dealsSaved?: number
}

export class QueueOrchestrator extends BaseScraperOrchestrator {
  private registry: ScraperRegistry
  private executor: ScraperExecutor
  private redis: Redis
  private queueName: string
  private workerConcurrency: number
  private retries: number
  private jobTimeoutMs: number
  private maxAttempts: number
  private runningJobs: Map<string, Promise<void>> = new Map()

  constructor(registry: ScraperRegistry, options: QueueOrchestratorOptions = {}) {
    super(options)
    this.registry = registry
    this.executor = new ScraperExecutor()
    this.redis = new Redis(options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379')
    this.queueName = options.queueName || 'dealerhunt:scraper:queue'
    this.workerConcurrency = options.workerConcurrency || 3
    this.retries = options.retries || 2
    this.jobTimeoutMs = options.jobTimeoutMs || 300000
    this.maxAttempts = options.maxAttempts || 3
  }

  getDeadLetterQueueName(): string {
    return `${this.queueName}:dlq`
  }

  private retryDelayMs(attempt: number): number {
    // Exponential backoff: 30s, 2m, 4m, 8m, 15m
    const delays = [30000, 120000, 240000, 480000, 900000]
    return delays[Math.min(attempt, delays.length - 1)]
  }

  async enqueue(sourceIds?: string[]): Promise<number> {
    const rawScrapers = sourceIds
      ? sourceIds.map(id => this.registry.get(id))
      : this.registry.getEnabled()

    const scrapers = rawScrapers.filter((s): s is RegisteredScraper => Boolean(s))

    const jobs = scrapers.map(scraper => {
      const job: ScrapeJob = {
        id: `${scraper.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sourceId: scraper.id,
        name: scraper.name,
        status: 'pending',
        attempts: 0,
        maxAttempts: this.maxAttempts,
      }
      return job
    })

    const pipeline = this.redis.pipeline()
    for (const job of jobs) {
      pipeline.lpush(this.queueName, JSON.stringify(job))
      pipeline.hset(`${this.queueName}:jobs:${job.id}`, 'status', job.status)
    }
    await pipeline.exec()

    this.log(`Enqueued ${jobs.length} jobs`)
    return jobs.length
  }

  async run(sourceIds?: string[]): Promise<ScrapeResult[]> {
    this.runs = []
    this.status = 'running'
    this.abortController = new AbortController()
    this.startTime = Date.now()
    this.emitProgress()

    // Enqueue if not already queued
    const queueLength = await this.redis.llen(this.queueName)
    if (queueLength === 0) {
      await this.enqueue(sourceIds)
    }

    this.log(`Queue run starting (workers=${this.workerConcurrency})`)

    const workers: Promise<void>[] = []
    for (let i = 0; i < this.workerConcurrency; i++) {
      workers.push(this.workerLoop())
    }

    await Promise.all(workers)

    this.status = this.abortController.signal.aborted ? 'paused' : 'completed'
    this.emitProgress()
    this.log(`Queue run complete. ${this.runs.length} results.`)
    return this.runs
  }

  private async workerLoop(): Promise<void> {
    while (this.status === 'running' && !this.abortController?.signal.aborted) {
      const jobJson = await this.redis.brpop(this.queueName, 5)
      if (!jobJson) continue

      const job: ScrapeJob = JSON.parse(jobJson[1])
      if (this.abortController?.signal.aborted) {
        await this.requeue(job)
        break
      }

      await this.processJob(job)
    }
  }

  private async processJob(job: ScrapeJob): Promise<void> {
    const scraper = this.registry.get(job.sourceId)
    if (!scraper) {
      this.log(`Job ${job.id} references unknown scraper ${job.sourceId}`, 'error')
      job.status = 'failed'
      job.error = 'Scraper not registered'
      await this.updateJob(job)
      return
    }

    job.status = 'running'
    job.attempts += 1
    job.startedAt = new Date().toISOString()
    await this.updateJob(job)

    const runId = await this.logScrapeStart(scraper.id)
    const start = Date.now()

    try {
      const execResult = await this.executor.execute(scraper, {
        abortSignal: this.abortController?.signal,
        dryRun: this.options.dryRun,
        maxRetries: this.retries,
        timeoutMs: this.jobTimeoutMs,
        costGuard: this.costGuard,
        circuitBreaker: this.circuitBreaker,
      })

      const duration = Date.now() - start
      job.status = execResult.success ? 'completed' : 'failed'
      job.durationMs = duration
      job.dealsFound = execResult.dealsFound
      job.dealsSaved = execResult.dealsSaved
      job.error = execResult.error
      job.completedAt = new Date().toISOString()

      await this.logScrapeComplete(
        runId,
        scraper.id,
        execResult.dealsFound,
        execResult.dealsSaved,
        duration,
        execResult.success ? 'success' : 'error'
      )

      await this.registry.updateStats(scraper.id, execResult.success, duration, execResult.dealsFound)
      await this.recordResult({
        source: scraper.id,
        success: execResult.success,
        dealsFound: execResult.dealsFound,
        dealsSaved: execResult.dealsSaved,
        duration,
        error: execResult.error,
      })
    } catch (error) {
      const duration = Date.now() - start
      const message = error instanceof Error ? error.message : 'Unknown error'
      job.status = 'failed'
      job.error = message
      job.durationMs = duration
      job.completedAt = new Date().toISOString()
      await this.logScrapeError(runId, error)
      await this.registry.updateStats(scraper.id, false, duration, 0)
      await this.recordResult({ source: scraper.id, success: false, dealsFound: 0, duration, error: message })
    } finally {
      await this.updateJob(job)
      this.emitProgress()

      if (job.status === 'failed') {
        if (job.attempts < job.maxAttempts) {
          await this.requeue(job)
        } else {
          await this.moveToDeadLetter(job)
        }
      }
    }
  }

  private async requeue(job: ScrapeJob): Promise<void> {
    const retryJob: ScrapeJob = {
      ...job,
      id: `${job.sourceId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: 'pending',
      startedAt: undefined,
      completedAt: undefined,
    }
    const delayMs = this.retryDelayMs(job.attempts)
    await this.redis.lpush(this.queueName, JSON.stringify(retryJob))
    await this.redis.hset(`${this.queueName}:jobs:${retryJob.id}`, {
      status: 'pending',
      retry_after: new Date(Date.now() + delayMs).toISOString(),
      attempts: retryJob.attempts,
    })
    this.log(`Requeued job ${job.sourceId} (attempt ${job.attempts + 1}/${job.maxAttempts}, delay ${delayMs}ms)`)
  }

  private async moveToDeadLetter(job: ScrapeJob): Promise<void> {
    const dlqJob = {
      ...job,
      movedAt: new Date().toISOString(),
    }
    await this.redis.lpush(this.getDeadLetterQueueName(), JSON.stringify(dlqJob))
    await this.redis.hset(`${this.queueName}:jobs:${job.id}`, 'status', 'dead_letter')
    this.log(`Job ${job.sourceId} moved to dead-letter queue after ${job.attempts} attempts`, 'error')
  }

  async getDeadLetterJobs(limit = 100): Promise<ScrapeJob[]> {
    const items = await this.redis.lrange(this.getDeadLetterQueueName(), 0, limit - 1)
    return items.map(item => JSON.parse(item))
  }

  async retryDeadLetter(limit = 10): Promise<number> {
    let requeued = 0
    for (let i = 0; i < limit; i++) {
      const item = await this.redis.rpop(this.getDeadLetterQueueName())
      if (!item) break
      const job = JSON.parse(item)
      const retryJob: ScrapeJob = {
        ...job,
        id: `${job.sourceId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        status: 'pending',
        attempts: 0,
        startedAt: undefined,
        completedAt: undefined,
      }
      await this.redis.lpush(this.queueName, JSON.stringify(retryJob))
      await this.redis.hset(`${this.queueName}:jobs:${retryJob.id}`, 'status', 'pending')
      requeued++
    }
    this.log(`Retried ${requeued} dead-letter jobs`)
    return requeued
  }

  async clearDeadLetterQueue(): Promise<void> {
    await this.redis.del(this.getDeadLetterQueueName())
    this.log('Dead-letter queue cleared')
  }

  private async updateJob(job: ScrapeJob): Promise<void> {
    await this.redis.hset(`${this.queueName}:jobs:${job.id}`, {
      status: job.status,
      attempts: job.attempts,
      error: job.error || '',
      durationMs: job.durationMs || 0,
      dealsFound: job.dealsFound || 0,
      dealsSaved: job.dealsSaved || 0,
    })
  }

  async getJobStatus(jobId: string): Promise<ScrapeJob | null> {
    const data = await this.redis.hgetall(`${this.queueName}:jobs:${jobId}`)
    if (!data || Object.keys(data).length === 0) return null
    return {
      id: jobId,
      sourceId: data.sourceId || '',
      name: data.name || '',
      status: data.status as ScrapeJob['status'],
      attempts: parseInt(data.attempts) || 0,
      maxAttempts: parseInt(data.maxAttempts) || 0,
      error: data.error || undefined,
      durationMs: parseInt(data.durationMs) || 0,
      dealsFound: parseInt(data.dealsFound) || 0,
      dealsSaved: parseInt(data.dealsSaved) || 0,
    }
  }

  getQueueName(): string {
    return this.queueName
  }

  getRedis(): Redis {
    return this.redis
  }

  async getQueueLength(): Promise<number> {
    return this.redis.llen(this.queueName)
  }

  async getJobStatuses(limit = 100): Promise<ScrapeJob[]> {
    const keys = await this.redis.keys(`${this.queueName}:jobs:*`)
    const jobs: ScrapeJob[] = []
    for (const key of keys.slice(0, limit)) {
      const id = key.split(':jobs:')[1]
      if (!id) continue
      const data = await this.redis.hgetall(key)
      if (!data || Object.keys(data).length === 0) continue
      jobs.push({
        id,
        sourceId: data.sourceId || '',
        name: data.name || '',
        status: data.status as ScrapeJob['status'],
        attempts: parseInt(data.attempts) || 0,
        maxAttempts: parseInt(data.maxAttempts) || 0,
        error: data.error || undefined,
        durationMs: parseInt(data.durationMs) || 0,
        dealsFound: parseInt(data.dealsFound) || 0,
        dealsSaved: parseInt(data.dealsSaved) || 0,
      })
    }
    return jobs
  }

  async stop(): Promise<void> {
    this.log('Stopping queue orchestrator...')
    this.abortController?.abort()
    this.status = 'paused'
    await this.redis.quit()
  }

  async clearQueue(): Promise<void> {
    await this.redis.del(this.queueName)
    await this.redis.del(this.getDeadLetterQueueName())
    const jobKeys = await this.redis.keys(`${this.queueName}:jobs:*`)
    if (jobKeys.length > 0) {
      await this.redis.del(...jobKeys)
    }
    this.log('Queue and dead-letter queue cleared')
  }
}
