// lib/scrapers/tools/human-behavior.ts
// Lightweight human-like behavior for browser automation. Adds realistic
// mouse, scroll, and typing patterns to reduce instant-automation signals.

import { Page } from 'playwright'

export interface HumanBehaviorOptions {
  typingDelayMin?: number
  typingDelayMax?: number
  clickPauseMin?: number
  clickPauseMax?: number
  scrollStepMin?: number
  scrollStepMax?: number
  scrollPauseMin?: number
  scrollPauseMax?: number
}

export class HumanBehavior {
  private options: Required<HumanBehaviorOptions>

  constructor(options: HumanBehaviorOptions = {}) {
    this.options = {
      typingDelayMin: 50,
      typingDelayMax: 180,
      clickPauseMin: 80,
      clickPauseMax: 350,
      scrollStepMin: 60,
      scrollStepMax: 220,
      scrollPauseMin: 120,
      scrollPauseMax: 600,
      ...options,
    }
  }

  private random(min: number, max: number): number {
    return Math.random() * (max - min) + min
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms))
  }

  async type(page: Page, selector: string, text: string): Promise<void> {
    const el = page.locator(selector)
    await el.click()
    await this.sleep(this.random(100, 250))

    for (const char of text) {
      await el.press(char)
      await this.sleep(this.random(this.options.typingDelayMin, this.options.typingDelayMax))
    }
  }

  async click(page: Page, selector: string): Promise<void> {
    const box = await page.locator(selector).boundingBox()
    if (box) {
      await this.moveMouse(page, box.x + box.width / 2, box.y + box.height / 2)
    }
    await this.sleep(this.random(this.options.clickPauseMin, this.options.clickPauseMax))
    await page.locator(selector).click()
  }

  async moveMouse(page: Page, targetX: number, targetY: number): Promise<void> {
    const current = await page.evaluate(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))
    const steps = 8 + Math.floor(Math.random() * 10)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const x = current.x + (targetX - current.x) * t + this.random(-5, 5)
      const y = current.y + (targetY - current.y) * t + this.random(-5, 5)
      await page.mouse.move(x, y)
      await this.sleep(this.random(15, 40))
    }
  }

  async scroll(page: Page, distance: number = -1): Promise<void> {
    const finalDistance = distance < 0
      ? await page.evaluate(() => document.body.scrollHeight - window.innerHeight)
      : distance

    let scrolled = 0
    while (scrolled < finalDistance) {
      const step = Math.min(this.random(this.options.scrollStepMin, this.options.scrollStepMax), finalDistance - scrolled)
      await page.mouse.wheel(0, step)
      scrolled += step
      await this.sleep(this.random(this.options.scrollPauseMin, this.options.scrollPauseMax))
    }
  }

  async waitAfterLoad(page: Page, baseMs: number = 1000): Promise<void> {
    await this.sleep(baseMs + this.random(200, 1200))
  }

  async naturalize(page: Page): Promise<void> {
    await this.sleep(this.random(300, 800))
    await this.scroll(page, this.random(200, 600))
    await this.sleep(this.random(200, 700))
  }
}
