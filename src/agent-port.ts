import type { BridgeConfig } from './config.js'
import { modelRoute } from './config.js'
import type { Logger } from './logger.js'
import { userMessage } from './message.js'
import type { AgentLaunch, AgentPort } from './service.js'

interface AgentHandle {
  agent: {
    followup(message: unknown): unknown
    steer(message: unknown): unknown
  }
  dispose?: () => Promise<void>
}

interface AgentRegistry {
  create(options: Record<string, unknown>): Promise<AgentHandle>
  resume(options: Record<string, unknown>): Promise<AgentHandle>
}

/**
 * Minimal slice of the Cordis context this plugin touches.
 * Typed locally so the package does not import `@deepseek-ai/dsh-*`
 * (those modules must stay the host's single copy).
 */
export interface DshContext {
  agents: AgentRegistry
  // Cordis listeners are untyped at this boundary. `any` matches that bus.
  on(name: string, listener: (...args: any[]) => unknown): unknown
  effect(callback: () => void | (() => void)): unknown
  logger?: unknown
}

function routeOf(config: BridgeConfig, launch: AgentLaunch): { provider: string; model: string } | undefined {
  if (launch.provider && launch.model) return { provider: launch.provider, model: launch.model }
  return modelRoute(config)
}

function optionsFor(config: BridgeConfig, launch: AgentLaunch): Record<string, unknown> {
  const route = routeOf(config, launch)
  return route ? { agentOptions: route } : {}
}

/**
 * Live agents created through `ctx.agents`. Messages include `id`, `role`,
 * `content`, and `source` — the same shape as `createUserMessage`.
 */
export function createDshAgentPort(ctx: DshContext, config: BridgeConfig, logger: Logger): AgentPort {
  const handles = new Map<string, AgentHandle>()

  function remember(sessionId: string, handle: AgentHandle): void {
    handles.set(sessionId, handle)
  }

  return {
    has(sessionId) {
      return handles.has(sessionId)
    },

    async create(launch) {
      const handle = await ctx.agents.create({
        sessionId: launch.sessionId,
        meta: { cwd: launch.cwd },
        ...optionsFor(config, launch),
      })
      remember(launch.sessionId, handle)
    },

    async resume(launch) {
      const handle = await ctx.agents.resume({
        resumeSessionId: launch.sessionId,
        ...optionsFor(config, launch),
      })
      remember(launch.sessionId, handle)
    },

    followup(sessionId, text) {
      const handle = handles.get(sessionId)
      if (!handle) throw new Error(`no live agent for session ${sessionId}`)
      handle.agent.followup(userMessage(text))
    },

    steer(sessionId, text) {
      const handle = handles.get(sessionId)
      if (!handle) throw new Error(`no live agent for session ${sessionId}`)
      handle.agent.steer(userMessage(text))
    },

    async disposeAll() {
      const pending = [...handles.values()]
      handles.clear()
      await Promise.all(pending.map(async (handle) => {
        try {
          await handle.dispose?.()
        } catch (error) {
          logger.warn(`agent dispose failed: ${error instanceof Error ? error.message : 'unknown'}`)
        }
      }))
    },
  }
}
