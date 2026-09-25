// lib/scrapers/tools/credentials.ts
// Encrypted credential store for auth-required scrapers (IAA, ACV, ADESA, Manheim, Facebook, etc.)

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export interface ScraperCredentials {
  sourceId: string
  username?: string
  password?: string
  apiKey?: string
  apiSecret?: string
  token?: string
  refreshToken?: string
  cookies?: string
  sessionStorage?: string
  expiresAt?: string
  [key: string]: string | undefined
}

export interface CredentialManagerOptions {
  supabaseUrl?: string
  supabaseKey?: string
  encryptionKey?: string
}

export class ScraperCredentialManager {
  private supabase: SupabaseClient
  private encryptionKey: string

  constructor(options: CredentialManagerOptions = {}) {
    const supabaseUrl = options.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and key are required for ScraperCredentialManager')
    }
    const key = options.encryptionKey || process.env.SCRAPER_CREDENTIAL_ENCRYPTION_KEY
    if (!key) {
      throw new Error('A 32-byte SCRAPER_CREDENTIAL_ENCRYPTION_KEY is required for credential encryption')
    }
    if (Buffer.byteLength(key, 'utf-8') !== 32) {
      throw new Error('SCRAPER_CREDENTIAL_ENCRYPTION_KEY must be exactly 32 bytes (use a generated secret)')
    }
    this.supabase = createClient(supabaseUrl, supabaseKey)
    this.encryptionKey = key
  }

  async getCredentials(sourceId: string): Promise<ScraperCredentials | null> {
    const { data, error } = await this.supabase
      .from('scraper_credentials')
      .select('payload, updated_at')
      .eq('source_id', sourceId)
      .single()

    if (error || !data) {
      if (error?.code !== 'PGRST116') {
        console.warn(`[CredentialManager] Failed to load credentials for ${sourceId}:`, error?.message)
      }
      return null
    }

    try {
      const decrypted = this.decrypt(data.payload)
      return { sourceId, ...decrypted }
    } catch (err) {
      console.error(`[CredentialManager] Failed to decrypt credentials for ${sourceId}:`, err)
      return null
    }
  }

  async setCredentials(sourceId: string, credentials: Omit<ScraperCredentials, 'sourceId'>): Promise<void> {
    const payload = this.encrypt(credentials)
    const { error } = await this.supabase
      .from('scraper_credentials')
      .upsert(
        { source_id: sourceId, payload, updated_at: new Date().toISOString() },
        { onConflict: 'source_id' }
      )

    if (error) {
      throw new Error(`Failed to save credentials for ${sourceId}: ${error.message}`)
    }
  }

  async deleteCredentials(sourceId: string): Promise<void> {
    const { error } = await this.supabase
      .from('scraper_credentials')
      .delete()
      .eq('source_id', sourceId)

    if (error) {
      throw new Error(`Failed to delete credentials for ${sourceId}: ${error.message}`)
    }
  }

  async hasCredentials(sourceId: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('scraper_credentials')
      .select('source_id', { count: 'exact', head: true })
      .eq('source_id', sourceId)

    if (error) {
      console.warn(`[CredentialManager] Failed to check credentials for ${sourceId}:`, error.message)
      return false
    }
    return (count || 0) > 0
  }

  // AES-256-GCM authenticated encryption.
  private encrypt(obj: Record<string, unknown>): string {
    const json = JSON.stringify(obj)
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(this.encryptionKey, 'utf-8'), iv)
    const encrypted = Buffer.concat([cipher.update(json, 'utf-8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return Buffer.concat([iv, authTag, encrypted]).toString('base64')
  }

  private decrypt(payload: string): Record<string, unknown> {
    const buffer = Buffer.from(payload, 'base64')
    const iv = buffer.subarray(0, 12)
    const authTag = buffer.subarray(12, 28)
    const encrypted = buffer.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(this.encryptionKey, 'utf-8'), iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return JSON.parse(decrypted.toString('utf-8'))
  }
}
