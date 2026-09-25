// lib/scrapers/orchestrators/concurrent.ts
// Runs multiple sources in parallel with a configurable concurrency limit.

import { BaseScraperOrchestrator, OrchestratorOptions } from './base'
import { ScrapeResult } from '@/types'
import { ScraperRegistry, RegisteredScraper } from '../tools/registry'
import { ScraperExecutor } from '../tools/executor'

export interface ConcurrentOrchestratorOptions extends OrchestratorOptions {
  concurrency?: number
  perSourceTimeoutMs?: number
  staggerMs?: number
  retries?: number
}

export class ConcurrentOrchestrator extends BaseScraperOrchestrator {
  private registry: ScraperRegistry
  private executor: ScraperExecutor
  private concurrency: number
  private staggerMs: number
  private retries: number

  constructor(registry: ScraperRegistry, options: ConcurrentOrchestratorOptions = {}) {
    super(options)
    this.registry = registry
    this.executor = new ScraperExecutor()
    this.concurrency = options.concurrency || 3
    this.staggerMs = options.staggerMs || 1000
    this.retries = options.retries || 2
  }

  async run(sourceIds?: string[]): Promise<ScrapeResult[]> {
    this.runs = []
    this.status = 'running'
    this.abortController = new AbortController()
    this.startTime = Date.now()
    this.emitProgress()

    const rawScrapers = sourceIds
      ? sourceIds.map(id => this.registry.get(id))
      : this.registry.getEnabled()

    const scrapers = rawScrapers.filter((s): s is RegisteredScraper => Boolean(s))
    this.log(`Concurrent run starting for ${scrapers.length} sources (concurrency=${this.concurrency})`)

    const queue = [...scrapers]
    const running: Promise<void>[] = []

    const runSource = async (scraper: RegisteredScraper) => {
      if (this.abortController?.signal.aborted) return

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
        const result: ScrapeResult = {
          source: scraper.id,
          success: execResult.success,
          dealsFound: execResult.dealsFound,
          dealsSaved: execResult.dealsSaved,
          duration,
          error: execResult.error,
        }

        await this.logScrapeComplete(
          runId,
          scraper.id,
          execResult.dealsFound,
          execResult.dealsSaved,
          duration,
          execResult.success ? 'success' : 'error'
        )

        await this.registry.updateStats(scraper.id, execResult.success, duration, execResult.dealsFound)
        await this.recordResult(result)
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
        if (this.staggerMs > 0) {
          await this.delay(this.staggerMs)
        }
      }
    }

    for (let i = 0; i < this.concurrency; i++) {
      running.push(worker())
    }

    await Promise.all(running)

    this.status = this.abortController?.signal.aborted ? 'paused' : 'completed'
    this.emitProgress()
    this.log(`Concurrent run complete. ${this.runs.length} results.`)
    return this.runs
  }

  async stop(): Promise<void> {
    this.log('Stopping concurrent orchestrator...')
    this.abortController?.abort()
    this.status = 'paused'
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
