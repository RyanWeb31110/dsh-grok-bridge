import { normalizeConfig, type RawConfig } from './config.js'
import { createDshAgentPort, type DshContext } from './agent-port.js'
import { attachLifecycle } from './lifecycle.js'
import { pluginLogger } from './logger.js'
import { startBridge } from './runtime.js'
import { Config } from './schema.js'
import { createTaskService } from './service.js'
import { openTaskStore } from './store.js'

export const name = 'dsh-grok-bridge'

/**
 * Wait for the agent registry, session persistence, and the profile default
 * model. Stock profiles mount that default as `agent-default-model`.
 */
export const inject = ['agents', 'sessions', 'sessionPersistence', 'agentDefaultModel']

export { Config }

/**
 * In-process DeepSeek Harness plugin.
 * Grok calls the HTTP API; dsh session events leave as signed webhooks.
 */
export function apply(ctx: DshContext, rawConfig: RawConfig = {}): void {
  const config = normalizeConfig(rawConfig)
  const logger = pluginLogger(ctx)
  const store = openTaskStore(config.storePath, config.maxTasks)
  const driver = createDshAgentPort(ctx, config, logger)
  const service = createTaskService({ config, store, driver, logger })
  attachLifecycle(ctx, service, logger)

  let close: (() => Promise<void>) | undefined
  ctx.effect(() => {
    let stopped = false
    void startBridge({ config, service, logger }).then((bridge) => {
      close = () => bridge.close()
      if (stopped) void close()
    }).catch((error: unknown) => {
      logger.warn(`failed to listen: ${error instanceof Error ? error.message : 'unknown'}`)
    })
    return () => {
      stopped = true
      void close?.()
    }
  })
}
