// lib/scrapers/orchestrators/sequential.ts
// Simple sequential orchestrator: runs one source at a time, easiest to debug.

import { BaseScraperOrchestrator, OrchestratorOptions } from './base'
import { ScrapeResult } from '@/types'
import { ScraperRegistry } from '../tools/registry'
import { ScraperExecutor } from '../tools/executor'

export class SequentialOrchestrator extends BaseScraperOrchestrator {
  private registry: ScraperRegistry
  private executor: ScraperExecutor

  constructor(registry: ScraperRegistry, options: OrchestratorOptions = {}) {
    super(options)
    this.registry = registry
    this.executor = new ScraperExecutor()
  }

  async run(sourceIds?: string[]): Promise<ScrapeResult[]> {
    this.runs = []
    this.status = 'running'
    this.abortController = new AbortController()
    this.startTime = Date.now()
    this.emitProgress()

    const scrapers = sourceIds
      ? (sourceIds.map(id => this.registry.get(id)).filter(Boolean) as import('../tools/registry').RegisteredScraper[])
      : this.registry.getEnabled()

    this.log(`Sequential run starting for ${scrapers.length} sources`)

    for (const scraper of scrapers) {
      if (this.abortController.signal.aborted) {
        this.status = 'paused'
        this.emitProgress()
        break
      }

      const runId = await this.logScrapeStart(scraper.id)
      const start = Date.now()
      let result: ScrapeResult

      try {
        const execResult = await this.executor.execute(scraper, {
          abortSignal: this.abortController.signal,
          dryRun: this.options.dryRun,
          costGuard: this.costGuard,
          circuitBreaker: this.circuitBreaker,
        })

        const duration = Date.now() - start
        result = {
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
      } catch (error) {
        const duration = Date.now() - start
        const message = error instanceof Error ? error.message : 'Unknown error'
        result = { source: scraper.id, success: false, dealsFound: 0, duration, error: message }
        await this.registry.updateStats(scraper.id, false, duration, 0)
        await this.logScrapeError(runId, error)
      }

      await this.recordResult(result)
      this.emitProgress()
    }

    this.status = this.abortController.signal.aborted ? 'paused' : 'completed'
    this.emitProgress()
    this.log(`Sequential run complete. ${this.runs.length} results.`)
    return this.runs
  }

  async stop(): Promise<void> {
    this.log('Stopping sequential orchestrator...')
    this.abortController?.abort()
    this.status = 'paused'
  }
}
