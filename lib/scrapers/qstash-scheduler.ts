// lib/scrapers/qstash-scheduler.ts
// Serverless scheduling for scraper jobs via Upstash QStash.

import { Client } from '@upstash/qstash'

function getClient(): Client | null {
  const token = process.env.QSTASH_TOKEN
  if (!token) return null
  return new Client({ token })
}

export async function scheduleScrape(source: string, cron: string, url = `${process.env.NEXT_PUBLIC_APP_URL}/api/scrape/run`): Promise<{ id?: string; error?: string }> {
  const client = getClient()
  if (!client) {
    return { error: 'QStash not configured. Set QSTASH_TOKEN.' }
  }

  try {
    const schedule = await client.schedules.create({
      destination: url,
      cron,
      body: JSON.stringify({ source }),
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return { id: schedule.scheduleId }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown QStash error'
    return { error: message }
  }
}

export async function listScrapeSchedules(): Promise<{ schedules: any[]; error?: string }> {
  const client = getClient()
  if (!client) return { schedules: [], error: 'QStash not configured' }

  try {
    const res = await client.schedules.list()
    return { schedules: res }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown QStash error'
    return { schedules: [], error: message }
  }
}

export async function cancelScrapeSchedule(id: string): Promise<{ success: boolean; error?: string }> {
  const client = getClient()
  if (!client) return { success: false, error: 'QStash not configured' }

  try {
    await client.schedules.delete(id)
    return { success: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown QStash error'
    return { success: false, error: message }
  }
}
