import { errorText, readSessionEvent, sessionIdOf } from './events.js'
import type { Logger } from './logger.js'
import type { TaskService } from './service.js'

interface EventContext {
  on(name: string, listener: (...args: any[]) => unknown): unknown
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

/**
 * Observe harness events for tasks this bridge owns.
 * `approval/request` is a waterfall: always call `next()` so the bridge
 * never grants or swallows a tool approval.
 */
export function attachLifecycle(ctx: EventContext, service: TaskService, logger: Logger): void {
  ctx.on('agent/status', (payload: unknown) => {
    const body = asRecord(payload)
    const sessionId = sessionIdOf(body?.['agent'])
    const status = body?.['status']
    if (!sessionId || typeof status !== 'string') return
    service.onStatus(sessionId, status)
  })

  ctx.on('session/event', (session: unknown, event: unknown) => {
    const sessionId = sessionIdOf({ session })
    if (!sessionId) return
    const observation = readSessionEvent(event)
    if (!observation) return
    if (observation.kind === 'assistant') service.onAssistantText(sessionId, observation.text)
    else service.onTurnEnd(sessionId, observation.reason, observation.error)
  })

  ctx.on('agent/error', (payload: unknown) => {
    const body = asRecord(payload)
    const sessionId = sessionIdOf(body?.['agent'])
    if (!sessionId) return
    service.onAgentError(sessionId, errorText(body?.['error']))
  })

  ctx.on('approval/request', (req: unknown, next: unknown) => {
    try {
      const body = asRecord(req)
      const sessionId = sessionIdOf(body?.['agent'])
      const toolName = typeof body?.['toolName'] === 'string' ? body['toolName'] : ''
      if (sessionId && toolName) {
        service.onApproval(sessionId, {
          toolName,
          ...(typeof body?.['reason'] === 'string' ? { reason: body['reason'] } : {}),
          ...(typeof body?.['callId'] === 'string' ? { callId: body['callId'] } : {}),
        })
      }
    } catch (error) {
      logger.warn(`approval observe failed: ${error instanceof Error ? error.message : 'unknown'}`)
    }
    if (typeof next !== 'function') return undefined
    return next()
  })
}
