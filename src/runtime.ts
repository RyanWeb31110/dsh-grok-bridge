import { isTailnetWebhookUrl, bindWarning } from './net.js'
import type { BridgeConfig } from './config.js'
import { closeServer, createHttpServer, listen } from './http.js'
import type { Logger } from './logger.js'
import { postEvent } from './outbound.js'
import type { TaskService } from './service.js'
import { VERSION } from './version.js'

export interface RunningBridge {
  port: number
  close(): Promise<void>
}

export async function startBridge(options: {
  config: BridgeConfig
  service: TaskService
  logger: Logger
  fetchImpl?: typeof fetch
}): Promise<RunningBridge> {
  const { config, service, logger } = options
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  warnAboutConfig(config, logger)

  const server = createHttpServer(config, service, logger)
  const port = await listen(server, config.host, config.port)
  logger.info(`dsh-grok-bridge ${VERSION} listening on http://${config.host}:${port}`)

  const timer = config.heartbeatMs > 0
    ? setInterval(() => {
      void postEvent(config, service.heartbeatEvent(), logger, fetchImpl)
    }, config.heartbeatMs)
    : undefined
  timer?.unref()

  void service.resumeActive().catch((error: unknown) => {
    logger.warn(`resume failed: ${error instanceof Error ? error.message : 'unknown'}`)
  })

  let closed = false
  return {
    port,
    async close() {
      if (closed) return
      closed = true
      if (timer) clearInterval(timer)
      await closeServer(server)
      await service.shutdown()
    },
  }
}

function warnAboutConfig(config: BridgeConfig, logger: Logger): void {
  if (config.token.length === 0) {
    logger.warn('token is empty; /v1/* will return 401 until DSH_GROK_TOKEN is set')
  } else if (config.token.length < 16) {
    logger.warn('token is shorter than 16 characters')
  }
  const bind = bindWarning(config.host)
  if (bind) logger.warn(bind)
  if ((config.provider && !config.model) || (!config.provider && config.model)) {
    logger.warn('set both provider and model to override the profile default; a partial pair is ignored and agent-default-model is used')
  }
  const outbound = config.outboundWebhookUrl
  if (outbound && !isTailnetWebhookUrl(outbound)) {
    logger.warn('outbound webhook URL is outside the tailnet; the happy path stays on 100.x or *.ts.net')
  }
  if (outbound && !config.outboundToken && !config.outboundHmacSecret) {
    logger.warn('outbound URL is set without a token or HMAC secret; events will not be sent')
  }
}
