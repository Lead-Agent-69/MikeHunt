// lib/scrapers/orchestrators/priority.ts
// Priority orchestrator: runs high-priority sources first, then medium, then low.

import { BaseScraperOrchestrator, OrchestratorOptions } from './base'
import { ScrapeResult } from '@/types'
import { ScraperRegistry, RegisteredScraper } from '../tools/registry'
import { ScraperExecutor } from '../tools/executor'

export interface PriorityOrchestratorOptions extends OrchestratorOptions {
  concurrencyPerPriority?: number
  priorityPhases?: ('high' | 'medium' | 'low')[]
  phaseDelayMs?: number
  retries?: number
}

export class PriorityOrchestrator extends BaseScraperOrchestrator {
  private registry: ScraperRegistry
  private executor: ScraperExecutor
  private concurrencyPerPriority: number
  private priorityPhases: ('high' | 'medium' | 'low')[]
  private phaseDelayMs: number
  private retries: number

  constructor(registry: ScraperRegistry, options: PriorityOrchestratorOptions = {}) {
    super(options)
    this.registry = registry
    this.executor = new ScraperExecutor()
    this.concurrencyPerPriority = options.concurrencyPerPriority || 3
    this.priorityPhases = options.priorityPhases || ['high', 'medium', 'low']
    this.phaseDelayMs = options.phaseDelayMs || 5000
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

    const allScrapers = rawScrapers.filter((s): s is RegisteredScraper => Boolean(s))
    this.log(`Priority run starting for ${allScrapers.length} sources`)

    for (const priority of this.priorityPhases) {
      if (this.abortController.signal.aborted) {
        this.status = 'paused'
        break
      }

      const scrapers = this.registry.sortByPriority(allScrapers.filter(s => s.priority === priority))
      if (scrapers.length === 0) continue

      this.log(`Priority phase: ${priority} (${scrapers.length} sources)`)
      await this.runPriorityPhase(scrapers)

      if (this.phaseDelayMs > 0 && priority !== this.priorityPhases[this.priorityPhases.length - 1]) {
        this.log(`Delaying ${this.phaseDelayMs}ms before next priority phase...`)
        await this.delay(this.phaseDelayMs)
      }
    }

    this.status = this.abortController.signal.aborted ? 'paused' : 'completed'
    this.emitProgress()
    this.log(`Priority run complete. ${this.runs.length} results.`)
    return this.runs
  }

  private async runPriorityPhase(scrapers: RegisteredScraper[]): Promise<void> {
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

    for (let i = 0; i < this.concurrencyPerPriority; i++) {
      workers.push(worker())
    }

    await Promise.all(workers)
  }

  async stop(): Promise<void> {
    this.log('Stopping priority orchestrator...')
    this.abortController?.abort()
    this.status = 'paused'
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
