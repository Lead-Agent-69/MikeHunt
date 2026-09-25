// lib/scrapers/tools/cost-guard.ts
// Enforce spending/time budgets per run and per source to avoid runaway cloud costs.

export interface CostGuardOptions {
  maxDurationMs?: number
  maxDealsPerRun?: number
  maxPagesPerRun?: number
  maxConcurrentBrowsers?: number
  estimateCostPerDeal?: number
  estimateCostPerBrowserPage?: number
}

export interface BudgetSnapshot {
  elapsedMs: number
  dealsSoFar: number
  pagesSoFar: number
  browsersSoFar: number
  estimatedCostCents: number
  remainingDurationMs: number
  remainingDeals: number
  remainingPages: number
}

export class CostGuard {
  private startMs: number
  private deals = 0
  private pages = 0
  private browsers = 0
  private options: Required<CostGuardOptions>

  constructor(options: CostGuardOptions = {}) {
    this.startMs = Date.now()
    this.options = {
      maxDurationMs: 10 * 60 * 1000, // 10 min
      maxDealsPerRun: 5000,
      maxPagesPerRun: 200,
      maxConcurrentBrowsers: 3,
      estimateCostPerDeal: 0, // cents
      estimateCostPerBrowserPage: 5, // ~$0.05 per browser page on cloud
      ...options,
    }
  }

  snapshot(): BudgetSnapshot {
    const elapsedMs = Date.now() - this.startMs
    const estimatedCostCents =
      this.deals * this.options.estimateCostPerDeal +
      this.pages * this.options.estimateCostPerBrowserPage

    return {
      elapsedMs,
      dealsSoFar: this.deals,
      pagesSoFar: this.pages,
      browsersSoFar: this.browsers,
      estimatedCostCents,
      remainingDurationMs: Math.max(0, this.options.maxDurationMs - elapsedMs),
      remainingDeals: Math.max(0, this.options.maxDealsPerRun - this.deals),
      remainingPages: Math.max(0, this.options.maxPagesPerRun - this.pages),
    }
  }

  check(reason: 'deal' | 'page' | 'browser' | 'time'): { allowed: boolean; why?: string } {
    const s = this.snapshot()

    if (s.remainingDurationMs <= 0) {
      return { allowed: false, why: `Run exceeded max duration ${this.options.maxDurationMs}ms` }
    }
    if (reason === 'deal' && s.remainingDeals <= 0) {
      return { allowed: false, why: `Run exceeded max deals ${this.options.maxDealsPerRun}` }
    }
    if (reason === 'page' && s.remainingPages <= 0) {
      return { allowed: false, why: `Run exceeded max pages ${this.options.maxPagesPerRun}` }
    }
    if (reason === 'browser' && s.browsersSoFar >= this.options.maxConcurrentBrowsers) {
      return { allowed: false, why: `Run exceeded max browsers ${this.options.maxConcurrentBrowsers}` }
    }

    return { allowed: true }
  }

  trackDeals(count: number): void {
    this.deals += count
  }

  trackPages(count: number): void {
    this.pages += count
  }

  trackBrowser(): void {
    this.browsers += 1
  }

  releaseBrowser(): void {
    this.browsers = Math.max(0, this.browsers - 1)
  }
}
