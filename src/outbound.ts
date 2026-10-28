import { randomUUID } from 'node:crypto'
import { signBody } from './auth.js'
import type { BridgeConfig } from './config.js'
import type { Logger } from './logger.js'
import type { OutboundEnvelope, OutboundEventType, PublicTask } from './types.js'
import { VERSION } from './version.js'

const MAX_OUTBOUND_TEXT = 16_000

export function webhookUrlFor(config: BridgeConfig, type: OutboundEventType): string {
  const specific: Record<OutboundEventType, string> = {
    'task.completed': config.webhookCompleted,
    'task.failed': config.webhookFailed,
    'task.needs_approval': config.webhookNeedsApproval,
    heartbeat: config.webhookHeartbeat,
  }
  return specific[type] || config.outboundWebhookUrl
}

export function clipTask(task: PublicTask): PublicTask {
  if (!task.resultText || task.resultText.length <= MAX_OUTBOUND_TEXT) return task
  return {
    ...task,
    resultText: task.resultText.slice(0, MAX_OUTBOUND_TEXT),
    resultTruncated: true,
  }
}

export function eventId(): string {
  return `evt_${randomUUID().replaceAll('-', '')}`
}

export interface PostResult {
  sent: boolean
  status?: number
}

export async function postEvent(
  config: BridgeConfig,
  event: OutboundEnvelope,
  logger: Logger,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<PostResult> {
  const url = webhookUrlFor(config, event.type)
  if (!url) return { sent: false }
  if (!config.outboundToken && !config.outboundHmacSecret) {
    logger.warn(`refusing ${event.type}: outbound URL is set but neither outbound token nor HMAC secret is`)
    return { sent: false }
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    logger.warn(`refusing ${event.type}: outbound URL is not a URL`)
    return { sent: false }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    logger.warn(`refusing ${event.type}: outbound URL must be http or https`)
    return { sent: false }
  }

  const body = JSON.stringify(event)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'user-agent': `dsh-grok-bridge/${VERSION}`,
    'x-dsh-event': event.type,
    'x-dsh-timestamp': timestamp,
  }
  if (config.outboundToken) {
    headers.authorization = `Bearer ${config.outboundToken}`
    headers['x-automation-key'] = config.outboundToken
  }
  if (config.outboundHmacSecret) {
    headers['x-dsh-signature'] = `sha256=${signBody(config.outboundHmacSecret, timestamp, body)}`
  }

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) logger.warn(`outbound ${event.type} returned HTTP ${response.status}`)
    return { sent: true, status: response.status }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'request failed'
    logger.warn(`outbound ${event.type} failed: ${message}`)
    return { sent: false }
  }
}
