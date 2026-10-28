import type { BridgeConfig } from './config.js'
import { modelRoute } from './config.js'
import type { Logger } from './logger.js'
import { userMessage } from './message.js'
import type { AgentLaunch, AgentPort } from './service.js'

interface SelectableModel {
  select?(selection: { provider: string; model: string; reasoningEffort?: string }): void
}

interface AgentHandle {
  agent: {
    followup(message: unknown): unknown
    steer(message: unknown): unknown
    /** Present on dsh 0.2 agents. Writes the durable `model/selection` the desktop picker reads. */
    model?: SelectableModel
  }
  dispose?: () => Promise<void>
}

interface AgentRegistry {
  create(options: Record<string, unknown>): Promise<AgentHandle>
  resume(options: Record<string, unknown>): Promise<AgentHandle>
}

/** Live profile default, the same route a new desktop chat starts on. */
export interface DefaultModelService {
  currentSelection?: (() => unknown) | unknown
}

/**
 * Minimal slice of the Cordis context this plugin touches.
 * Typed locally so the package does not import `@deepseek-ai/dsh-*`
 * (those modules must stay the host's single copy).
 */
export interface DshContext {
  agents: AgentRegistry
  /** Present on stock profiles as the `agent-default-model` row. */
  agentDefaultModel?: DefaultModelService
  // Cordis listeners are untyped at this boundary. `any` matches that bus.
  on(name: string, listener: (...args: any[]) => unknown): unknown
  effect(callback: () => void | (() => void)): unknown
  logger?: unknown
}

export interface ResolvedRoute {
  provider: string
  model: string
  reasoningEffort?: string
}

function routeOf(config: BridgeConfig, launch: AgentLaunch): ResolvedRoute | undefined {
  if (launch.provider && launch.model) return { provider: launch.provider, model: launch.model }
  return modelRoute(config)
}

function textField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Read `ctx.agentDefaultModel.currentSelection()` without assuming a method vs a snapshot. */
export function readProfileDefault(service: DefaultModelService | undefined): ResolvedRoute | undefined {
  if (!service) return undefined
  const current = service.currentSelection
  const value = typeof current === 'function' ? current.call(service) : current
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const provider = textField(record['provider'])
  const model = textField(record['model'])
  if (!provider || !model) return undefined
  const reasoningEffort = textField(record['reasoningEffort'])
  return reasoningEffort ? { provider, model, reasoningEffort } : { provider, model }
}

function agentOptions(route: ResolvedRoute): Record<string, unknown> {
  return {
    provider: route.provider,
    model: route.model,
    ...(route.reasoningEffort ? { reasoningEffort: route.reasoningEffort } : {}),
  }
}

/**
 * Live agents created through `ctx.agents`. Messages include `id`, `role`,
 * `content`, and `source` — the same shape as `createUserMessage`.
 */
export function createDshAgentPort(ctx: DshContext, config: BridgeConfig, logger: Logger): AgentPort {
  const handles = new Map<string, AgentHandle>()
  let announcedDefault = false

  function remember(sessionId: string, handle: AgentHandle): void {
    handles.set(sessionId, handle)
  }

  /**
   * Explicit env overrides win. Otherwise copy the profile default into
   * `agentOptions`. Omitting the route leaves `{{model}}` empty and the
   * persona prefix fails on the first turn.
   */
  function optionsFor(launch: AgentLaunch): { fields: Record<string, unknown>; explicit: ResolvedRoute | undefined } {
    const explicit = routeOf(config, launch)
    const route = explicit ?? readProfileDefault(ctx.agentDefaultModel)
    if (!route) {
      throw new Error(
        'dsh-grok-bridge: no model route. Leave DSH_GROK_PROVIDER and DSH_GROK_MODEL unset to inherit agent-default-model, and make sure that service is mounted.',
      )
    }
    if (!explicit && !announcedDefault) {
      announcedDefault = true
      const effort = route.reasoningEffort ? ` effort ${route.reasoningEffort}` : ''
      logger.info(`using profile default model ${route.provider}/${route.model}${effort}`)
    }
    return { fields: { agentOptions: agentOptions(route) }, explicit }
  }

  /** Record an explicit route as `model/selection` so the desktop picker does not keep showing the profile default. */
  function pinSelection(agent: AgentHandle['agent'], route: ResolvedRoute | undefined): void {
    if (!route) return
    const select = agent.model?.select
    if (typeof select !== 'function') {
      logger.warn('agent has no model.select; the desktop picker may keep showing the profile default')
      return
    }
    select.call(agent.model, {
      provider: route.provider,
      model: route.model,
      ...(route.reasoningEffort ? { reasoningEffort: route.reasoningEffort } : {}),
    })
  }

  return {
    has(sessionId) {
      return handles.has(sessionId)
    },

    async create(launch) {
      const resolved = optionsFor(launch)
      const handle = await ctx.agents.create({
        sessionId: launch.sessionId,
        meta: { cwd: launch.cwd },
        ...resolved.fields,
      })
      pinSelection(handle.agent, resolved.explicit)
      remember(launch.sessionId, handle)
    },

    async resume(launch) {
      const resolved = optionsFor(launch)
      const handle = await ctx.agents.resume({
        resumeSessionId: launch.sessionId,
        ...resolved.fields,
      })
      pinSelection(handle.agent, resolved.explicit)
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
