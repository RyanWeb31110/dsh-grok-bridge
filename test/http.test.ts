import assert from 'node:assert/strict'
import { createServer, type IncomingMessage } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { verifySignature } from '../src/auth.ts'
import { normalizeConfig } from '../src/config.ts'
import type { Logger } from '../src/logger.ts'
import { startBridge, type RunningBridge } from '../src/runtime.ts'
import { createTaskService, type AgentPort, type TaskService } from '../src/service.ts'
import { openTaskStore } from '../src/store.ts'

const TOKEN = 'test-token-value-ok-32chars'
const OUT_TOKEN = 'outbound-token-value-ok'
const HMAC = 'hmac-secret-value-ok-32'

function logger(): Logger {
  return { info() {}, warn() {} }
}

function readRaw(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function completingDriver(service: () => TaskService): AgentPort {
  const live = new Set<string>()
  const finish = (sessionId: string, text: string): void => {
    queueMicrotask(() => {
      service().onAssistantText(sessionId, `answer:${text}`)
      service().onTurnEnd(sessionId, 'completed')
    })
  }
  return {
    has: (id) => live.has(id),
    async create({ sessionId }) {
      live.add(sessionId)
    },
    async resume({ sessionId }) {
      live.add(sessionId)
    },
    followup: (id, text) => finish(id, text),
    steer: (id, text) => finish(id, text),
    async disposeAll() {
      live.clear()
    },
  }
}

async function listenLocal(onRequest: (req: IncomingMessage, body: string) => void): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    void readRaw(req).then((body) => {
      onRequest(req, body)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no port')
  return {
    url: `http://127.0.0.1:${address.port}/dsh-events`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

test('auth, task create, and signed completion webhook', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-grok-http-'))
  const hits: { body: string; signature: string | undefined; timestamp: string | undefined; auth: string | undefined; automation: string | undefined }[] = []
  const sink = await listenLocal((req, body) => {
    hits.push({
      body,
      signature: req.headers['x-dsh-signature'] as string | undefined,
      timestamp: req.headers['x-dsh-timestamp'] as string | undefined,
      auth: req.headers.authorization,
      automation: req.headers['x-automation-key'] as string | undefined,
    })
  })
  let bridge: RunningBridge | undefined
  try {
    const config = normalizeConfig({
      host: '127.0.0.1',
      port: 0,
      token: TOKEN,
      storePath: path.join(dir, 'tasks.json'),
      cwd: dir,
      outboundWebhookUrl: sink.url,
      outboundToken: OUT_TOKEN,
      outboundHmacSecret: HMAC,
      heartbeatMs: 0,
    })
    const log = logger()
    const store = openTaskStore(config.storePath, config.maxTasks)
    let service: TaskService | undefined
    const driver = completingDriver(() => {
      if (!service) throw new Error('service not ready')
      return service
    })
    service = createTaskService({ config, store, driver, logger: log })
    bridge = await startBridge({ config, service, logger: log })

    const health = await fetch(`http://127.0.0.1:${bridge.port}/healthz`)
    assert.equal(health.status, 200)
    const healthBody = await health.json() as { ok: boolean; version: string }
    assert.equal(healthBody.ok, true)
    assert.equal(typeof healthBody.version, 'string')

    const denied = await fetch(`http://127.0.0.1:${bridge.port}/v1/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer wrong-token-value' },
      body: JSON.stringify({ prompt: 'nope' }),
    })
    assert.equal(denied.status, 401)
    assert.equal(store.size, 0)

    const created = await fetch(`http://127.0.0.1:${bridge.port}/v1/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
        'idempotency-key': 'run-1',
      },
      body: JSON.stringify({ prompt: 'Say hello', title: 'hello' }),
    })
    assert.equal(created.status, 202)
    const createdBody = await created.json() as { task: { id: string; sessionId: string; status: string } }
    assert.match(createdBody.task.id, /^task_[0-9a-f]{32}$/)
    assert.ok(createdBody.task.sessionId)

    const replay = await fetch(`http://127.0.0.1:${bridge.port}/v1/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
        'idempotency-key': 'run-1',
      },
      body: JSON.stringify({ prompt: 'Say hello again' }),
    })
    assert.equal(replay.status, 200)
    const replayBody = await replay.json() as { task: { id: string } }
    assert.equal(replayBody.task.id, createdBody.task.id)
    assert.equal(store.size, 1)

    let taskStatus = ''
    for (let i = 0; i < 50 && taskStatus !== 'completed'; i += 1) {
      const view = await fetch(`http://127.0.0.1:${bridge.port}/v1/tasks/${createdBody.task.id}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      })
      const body = await view.json() as { task: { status: string; resultText?: string } }
      taskStatus = body.task.status
      if (taskStatus === 'completed') assert.match(body.task.resultText ?? '', /^answer:/)
      else await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.equal(taskStatus, 'completed')

    for (let i = 0; i < 50 && hits.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.equal(hits.length, 1)
    const hit = hits[0]
    assert.ok(hit)
    assert.equal(hit.auth, `Bearer ${OUT_TOKEN}`)
    assert.equal(hit.automation, OUT_TOKEN)
    assert.equal(verifySignature(HMAC, hit.timestamp ?? '', hit.body, hit.signature), true)
    const event = JSON.parse(hit.body) as { type: string; task: { id: string; status: string } }
    assert.equal(event.type, 'task.completed')
    assert.equal(event.task.id, createdBody.task.id)
    assert.equal(event.task.status, 'completed')

    const reloaded = openTaskStore(config.storePath)
    assert.equal(reloaded.get(createdBody.task.id)?.sessionId, createdBody.task.sessionId)
    assert.equal(reloaded.get(createdBody.task.id)?.status, 'completed')
  } finally {
    await bridge?.close()
    await sink.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('oversized bodies are rejected', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-grok-http-'))
  let bridge: RunningBridge | undefined
  try {
    const config = normalizeConfig({
      host: '127.0.0.1',
      port: 0,
      token: TOKEN,
      storePath: path.join(dir, 'tasks.json'),
      maxBodyBytes: 1024,
      heartbeatMs: 0,
    })
    const log = logger()
    const store = openTaskStore(config.storePath)
    const driver: AgentPort = {
      has: () => false,
      async create() {},
      async resume() {},
      followup() {},
      steer() {},
      async disposeAll() {},
    }
    const service = createTaskService({ config, store, driver, logger: log })
    bridge = await startBridge({ config, service, logger: log })
    const response = await fetch(`http://127.0.0.1:${bridge.port}/v1/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ prompt: 'x'.repeat(4000) }),
    })
    assert.equal(response.status, 413)
    assert.equal(store.size, 0)
  } finally {
    await bridge?.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('steer, approval observation, and cwd allowlist', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-grok-http-'))
  const project = path.join(dir, 'project')
  const events: string[] = []
  let bridge: RunningBridge | undefined
  try {
    const config = normalizeConfig({
      host: '127.0.0.1',
      port: 0,
      token: TOKEN,
      storePath: path.join(dir, 'tasks.json'),
      cwd: project,
      cwdAllowlist: project,
      outboundWebhookUrl: 'http://127.0.0.1:9/unused',
      outboundToken: OUT_TOKEN,
      heartbeatMs: 0,
    })
    const log = logger()
    const store = openTaskStore(config.storePath)
    const live = new Set<string>()
    let service: TaskService | undefined
    const driver: AgentPort = {
      has: (id) => live.has(id),
      async create({ sessionId }) {
        live.add(sessionId)
      },
      async resume({ sessionId }) {
        live.add(sessionId)
      },
      followup() {},
      steer() {},
      async disposeAll() {
        live.clear()
      },
    }
    service = createTaskService({
      config,
      store,
      driver,
      logger: log,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { type: string }
        events.push(body.type)
        return new Response('ok', { status: 200 })
      },
    })
    const { attachLifecycle } = await import('../src/lifecycle.ts')
    const listeners = new Map<string, (...args: any[]) => unknown>()
    attachLifecycle({
      on(name, fn) {
        listeners.set(name, fn)
      },
    }, service, log)
    bridge = await startBridge({ config, service, logger: log })

    const blocked = await fetch(`http://127.0.0.1:${bridge.port}/v1/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ prompt: 'read secrets', cwd: path.join(dir, 'other') }),
    })
    assert.equal(blocked.status, 403)

    const created = await fetch(`http://127.0.0.1:${bridge.port}/v1/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ prompt: 'inspect the repo' }),
    })
    assert.equal(created.status, 202)
    const { task } = await created.json() as { task: { id: string; sessionId: string; status: string } }
    assert.equal(task.status, 'queued')

    const approval = listeners.get('approval/request')
    assert.equal(typeof approval, 'function')
    const delegated = await approval?.(
      { agent: { session: { id: task.sessionId } }, toolName: 'bash', reason: 'runs rm', callId: 'call-1' },
      () => 'left-for-the-ui',
    )
    assert.equal(delegated, 'left-for-the-ui')
    const waiting = service.getTask(task.id)
    assert.equal(waiting?.status, 'needs_approval')
    assert.equal(waiting?.approval?.toolName, 'bash')
    assert.equal(waiting?.approval?.reason, 'runs rm')
    assert.ok(events.includes('task.needs_approval'))

    await approval?.(
      { agent: { session: { id: task.sessionId } }, toolName: 'bash', reason: 'runs rm', callId: 'call-1' },
      () => 'again',
    )
    assert.equal(events.filter((type) => type === 'task.needs_approval').length, 1)

    const steered = await fetch(`http://127.0.0.1:${bridge.port}/v1/tasks/${task.id}/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ text: 'focus on the tests' }),
    })
    assert.equal(steered.status, 202)
    const steeredBody = await steered.json() as { task: { steerCount: number; status: string } }
    assert.equal(steeredBody.task.steerCount, 1)
    assert.equal(steeredBody.task.status, 'needs_approval')

    service.onTurnEnd(task.sessionId, 'completed')
    assert.equal(service.getTask(task.id)?.status, 'completed')
    assert.ok(events.includes('task.completed'))
  } finally {
    await bridge?.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
