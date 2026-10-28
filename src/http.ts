import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { authorized } from './auth.js'
import type { BridgeConfig } from './config.js'
import { BridgeError } from './errors.js'
import type { Logger } from './logger.js'
import { isTaskId, type TaskService } from './service.js'
import { VERSION } from './version.js'

interface ReadResult {
  raw: string
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(payload)
}

function readBody(req: IncomingMessage, max: number): Promise<ReadResult> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    let settled = false
    const fail = (error: BridgeError): void => {
      if (settled) return
      settled = true
      reject(error)
    }
    const succeed = (result: ReadResult): void => {
      if (settled) return
      settled = true
      resolve(result)
    }
    req.on('data', (chunk: Buffer) => {
      if (settled) return
      size += chunk.length
      if (size > max) {
        tooLarge = true
        req.pause()
        fail(new BridgeError(413, 'payload_too_large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) fail(new BridgeError(413, 'payload_too_large'))
      else succeed({ raw: Buffer.concat(chunks).toString('utf8') })
    })
    req.on('error', () => {
      if (tooLarge) fail(new BridgeError(413, 'payload_too_large'))
      else fail(new BridgeError(400, 'invalid_body'))
    })
    req.on('close', () => {
      if (settled) return
      if (tooLarge) fail(new BridgeError(413, 'payload_too_large'))
      else if (!req.complete) fail(new BridgeError(400, 'invalid_body'))
    })
  })
}

async function parseJson(req: IncomingMessage, max: number): Promise<Record<string, unknown>> {
  const contentType = req.headers['content-type'] ?? ''
  if (!contentType.includes('application/json')) throw new BridgeError(400, 'invalid_body')
  const { raw } = await readBody(req, max)
  if (raw.trim() === '') throw new BridgeError(400, 'invalid_json')
  try {
    const value = JSON.parse(raw) as unknown
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new BridgeError(400, 'invalid_body')
    }
    return value as Record<string, unknown>
  } catch (error) {
    if (error instanceof BridgeError) throw error
    throw new BridgeError(400, 'invalid_json')
  }
}

function requireAuth(req: IncomingMessage, token: string): void {
  const header = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization
  if (!authorized(header, token)) throw new BridgeError(401, 'unauthorized')
}

function limitOf(raw: string | null): number {
  if (raw === null || raw === '') return 50
  if (!/^\d+$/.test(raw)) throw new BridgeError(400, 'invalid_limit')
  const value = Number(raw)
  if (value < 1 || value > 200) throw new BridgeError(400, 'invalid_limit')
  return value
}

export function createHttpServer(config: BridgeConfig, service: TaskService, logger: Logger): Server {
  return createServer((req, res) => {
    void handle(req, res, config, service, logger)
  })
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  config: BridgeConfig,
  service: TaskService,
  logger: Logger,
): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname
    const method = req.method ?? 'GET'

    if (path === '/healthz') {
      if (method !== 'GET') throw new BridgeError(405, 'method_not_allowed')
      send(res, 200, { ok: true, name: 'dsh-grok-bridge', version: VERSION })
      return
    }

    requireAuth(req, config.token)

    if (path === '/v1/tasks' && method === 'GET') {
      send(res, 200, { ok: true, tasks: service.listTasks(limitOf(url.searchParams.get('limit'))) })
      return
    }

    if (path === '/v1/tasks' && method === 'POST') {
      const body = await parseJson(req, config.maxBodyBytes)
      const header = req.headers['idempotency-key']
      const key = Array.isArray(header) ? header[0] : header
      const result = await service.createTask(body, key)
      send(res, result.created ? 202 : 200, { ok: true, task: result.task })
      return
    }

    const steer = /^\/v1\/tasks\/([^/]+)\/steer$/.exec(path)
    if (steer && steer[1]) {
      if (method !== 'POST') throw new BridgeError(405, 'method_not_allowed')
      if (!isTaskId(steer[1])) throw new BridgeError(404, 'not_found')
      const body = await parseJson(req, config.maxBodyBytes)
      const text = typeof body['text'] === 'string' ? body['text'] : body['prompt']
      const task = await service.steer(steer[1], typeof text === 'string' ? text : '')
      send(res, 202, { ok: true, task })
      return
    }

    const one = /^\/v1\/tasks\/([^/]+)$/.exec(path)
    if (one && one[1]) {
      if (method !== 'GET') throw new BridgeError(405, 'method_not_allowed')
      if (!isTaskId(one[1])) throw new BridgeError(404, 'not_found')
      const task = service.getTask(one[1])
      if (!task) throw new BridgeError(404, 'not_found')
      send(res, 200, { ok: true, task })
      return
    }

    throw new BridgeError(404, 'not_found')
  } catch (error) {
    if (res.headersSent || res.writableEnded) return
    if (error instanceof BridgeError) {
      if (error.status >= 500) logger.warn(`http ${error.status} ${error.code}`)
      if (!res.headersSent) send(res, error.status, { ok: false, error: error.code })
      if (error.status === 413) req.destroy()
      return
    }
    logger.warn(`http 500 ${error instanceof Error ? error.message : 'internal'}`)
    send(res, 500, { ok: false, error: 'internal' })
  }
}

export function listen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('error', onError)
      reject(error)
    }
    server.once('error', onError)
    server.listen(port, host, () => {
      server.off('error', onError)
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : port)
    })
  })
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve()
      return
    }
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
