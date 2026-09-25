// lib/scrapers/orchestrators/realtime.ts
// Real-time orchestrator: keeps a continuous loop, scraping sources based on frequency.

import { BaseScraperOrchestrator, OrchestratorOptions } from './base'
import { ScrapeResult } from '@/types'
import { ScraperRegistry, RegisteredScraper } from '../tools/registry'
import { ScraperExecutor } from '../tools/executor'

export interface RealtimeOrchestratorOptions extends OrchestratorOptions {
  concurrency?: number
  maxContinuousRuns?: number
  idleDelayMs?: number
  retries?: number
}

export class RealtimeOrchestrator extends BaseScraperOrchestrator {
  private registry: ScraperRegistry
  private executor: ScraperExecutor
  private concurrency: number
  private maxContinuousRuns: number
  private idleDelayMs: number
  private retries: number
  private runCount = 0
  private isRunning = false

  constructor(registry: ScraperRegistry, options: RealtimeOrchestratorOptions = {}) {
    super(options)
    this.registry = registry
    this.executor = new ScraperExecutor()
    this.concurrency = options.concurrency || 3
    this.maxContinuousRuns = options.maxContinuousRuns || Infinity
    this.idleDelayMs = options.idleDelayMs || 60000
    this.retries = options.retries || 2
  }

  async run(sourceIds?: string[]): Promise<ScrapeResult[]> {
    this.runs = []
    this.status = 'running'
    this.abortController = new AbortController()
    this.startTime = Date.now()
    this.isRunning = true
    this.emitProgress()

    this.log(`Real-time orchestrator started (maxRuns=${this.maxContinuousRuns})`)

    while (this.isRunning && !this.abortController.signal.aborted) {
      this.runCount += 1
      if (this.runCount > this.maxContinuousRuns) {
        this.log(`Reached max continuous runs (${this.maxContinuousRuns})`)
        break
      }

      this.log(`Real-time cycle #${this.runCount}`)
      const dueScrapers = this.registry.getDueForRun()
      const filtered = sourceIds
        ? dueScrapers.filter(s => sourceIds.includes(s.id))
        : dueScrapers

      if (filtered.length === 0) {
        this.log(`No sources due. Sleeping ${this.idleDelayMs}ms...`)
        await this.delay(this.idleDelayMs)
        continue
      }

      await this.runCycle(filtered)

      // Short pause between cycles to avoid hammering
      await this.delay(5000)
    }

    this.status = this.abortController.signal.aborted ? 'paused' : 'completed'
    this.isRunning = false
    this.emitProgress()
    this.log(`Real-time orchestrator stopped. Total cycles: ${this.runCount}`)
    return this.runs
  }

  private async runCycle(scrapers: RegisteredScraper[]): Promise<void> {
    const queue = [...scrapers]
    const workers: Promise<void>[] = []

    const runSource = async (scraper: RegisteredScraper) => {
      const runId = await this.logScrapeStart(scraper.id)
      const start = Date.now()

      try {
        const execResult = await this.executor.execute(scraper, {
          abortSignal: this.abortController?.signal,
          dryRun: this.options.dryRun,
          maxRetries: this.retries,
          timeoutMs: 300000,
          costGuard: this.costGuard,
          circuitBreaker: this.circuitBreaker,
        })

        const duration = Date.now() - start
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
        await this.logScrapeError(runId, error)
        await this.registry.updateStats(scraper.id, false, duration, 0)
        await this.recordResult({ source: scraper.id, success: false, dealsFound: 0, duration, error: message })
      } finally {
        this.emitProgress()
      }
    }

    const worker = async () => {
      while (queue.length > 0) {
        if (this.abortController?.signal.aborted) break
        const scraper = queue.shift()
        if (!scraper) continue
        await runSource(scraper)
      }
    }

    for (let i = 0; i < this.concurrency; i++) {
      workers.push(worker())
    }

    await Promise.all(workers)
  }

  async stop(): Promise<void> {
    this.log('Stopping real-time orchestrator...')
    this.isRunning = false
    this.abortController?.abort()
    this.status = 'paused'
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getRunCount(): number {
    return this.runCount
  }
}
