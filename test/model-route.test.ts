import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { normalizeConfig } from '../src/config.ts'
import type { Logger } from '../src/logger.ts'
import { createTaskService, type AgentLaunch, type AgentPort } from '../src/service.ts'
import { openTaskStore } from '../src/store.ts'
import { BridgeError } from '../src/errors.ts'

const silent: Logger = { info() {}, warn() {} }

function recordingDriver(launches: AgentLaunch[]): AgentPort {
  const live = new Set<string>()
  return {
    has: (id) => live.has(id),
    async create(launch) {
      launches.push(launch)
      live.add(launch.sessionId)
    },
    async resume(launch) {
      launches.push(launch)
      live.add(launch.sessionId)
    },
    followup() {},
    steer() {},
    async disposeAll() {
      live.clear()
    },
  }
}

test('a task body provider and model become the session route', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-grok-model-'))
  try {
    const launches: AgentLaunch[] = []
    const config = normalizeConfig({
      provider: 'magpie-responses',
      model: 'grok/grok-4.7',
      storePath: path.join(dir, 'tasks.json'),
      token: 'test-token-value-ok-32chars',
    })
    const service = createTaskService({
      config,
      store: openTaskStore(config.storePath),
      driver: recordingDriver(launches),
      logger: silent,
    })
    const { task } = await service.createTask({
      prompt: 'Reply with exactly: opus-ok',
      title: 'e2e opus 5.5',
      provider: 'magpie-anthropic',
      model: 'rootflowai-2/claude-opus-5-5',
    })
    assert.equal(task.provider, 'magpie-anthropic')
    assert.equal(task.model, 'rootflowai-2/claude-opus-5-5')
    assert.equal(launches[0]?.provider, 'magpie-anthropic')
    assert.equal(launches[0]?.model, 'rootflowai-2/claude-opus-5-5')
    assert.equal(launches[0]?.sessionId, task.sessionId)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('omitted provider and model leave the launch on the profile default', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-grok-model-'))
  try {
    const launches: AgentLaunch[] = []
    const config = normalizeConfig({
      provider: '',
      model: '',
      storePath: path.join(dir, 'tasks.json'),
      token: 'test-token-value-ok-32chars',
    })
    const service = createTaskService({
      config,
      store: openTaskStore(config.storePath),
      driver: recordingDriver(launches),
      logger: silent,
    })
    const { task } = await service.createTask({ prompt: 'hello' })
    assert.equal(task.provider, undefined)
    assert.equal(task.model, undefined)
    assert.equal(launches[0]?.provider, undefined)
    assert.equal(launches[0]?.model, undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a provider without a model is rejected', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-grok-model-'))
  try {
    const config = normalizeConfig({
      storePath: path.join(dir, 'tasks.json'),
      token: 'test-token-value-ok-32chars',
    })
    const service = createTaskService({
      config,
      store: openTaskStore(config.storePath),
      driver: recordingDriver([]),
      logger: silent,
    })
    await assert.rejects(
      () => service.createTask({ prompt: 'hello', provider: 'magpie-anthropic' }),
      (error: unknown) => error instanceof BridgeError && error.code === 'invalid_model_route',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
