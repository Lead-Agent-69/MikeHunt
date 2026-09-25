import { describe, it, expect, vi } from 'vitest'
import { HumanBehavior } from './human-behavior'

describe('HumanBehavior', () => {
  it('types text with delay', async () => {
    const behavior = new HumanBehavior({ typingDelayMin: 0, typingDelayMax: 0 })
    const press = vi.fn()
    const click = vi.fn()
    const page = {
      locator: () => ({ click, press }),
    } as any

    await behavior.type(page, '#input', 'ab')
    expect(press).toHaveBeenCalledTimes(2)
    expect(press).toHaveBeenNthCalledWith(1, 'a')
    expect(press).toHaveBeenNthCalledWith(2, 'b')
  })

  it('scrolls in steps', async () => {
    const behavior = new HumanBehavior({ scrollStepMin: 50, scrollStepMax: 50, scrollPauseMin: 0, scrollPauseMax: 0 })
    const wheel = vi.fn()
    const page = { mouse: { wheel } } as any

    await behavior.scroll(page, 150)
    expect(wheel).toHaveBeenCalledTimes(3)
    expect(wheel).toHaveBeenLastCalledWith(0, 50)
  })

  it('moves mouse over multiple steps', async () => {
    const behavior = new HumanBehavior({})
    const move = vi.fn()
    const page = {
      mouse: { move },
      evaluate: vi.fn().mockResolvedValue({ x: 100, y: 100 }),
    } as any

    await behavior.moveMouse(page, 200, 200)
    expect(move.mock.calls.length).toBeGreaterThan(5)
  })
})
