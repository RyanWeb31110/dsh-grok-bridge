import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDshAgentPort, type DshContext } from '../src/agent-port.ts'
import { normalizeConfig } from '../src/config.ts'
import type { Logger } from '../src/logger.ts'

const silent: Logger = { info() {}, warn() {} }

function harness(selection: unknown, calls: { create: unknown[]; resume: unknown[] }): DshContext {
  return {
    agents: {
      async create(options) {
        calls.create.push(options)
        return { agent: { followup() {}, steer() {} }, async dispose() {} }
      },
      async resume(options) {
        calls.resume.push(options)
        return { agent: { followup() {}, steer() {} }, async dispose() {} }
      },
    },
    agentDefaultModel: {
      currentSelection: () => selection,
    },
    on() {},
    effect() {},
  }
}

test('empty provider and model inherit the profile default on create and resume', async () => {
  const calls = { create: [] as unknown[], resume: [] as unknown[] }
  const ctx = harness({
    provider: 'magpie-responses',
    model: 'grok/grok-4.7',
    reasoningEffort: 'high',
  }, calls)
  const config = normalizeConfig({ provider: '', model: '' })
  const port = createDshAgentPort(ctx, config, silent)

  await port.create({ sessionId: 'session-1', cwd: '/work' })
  await port.resume({ sessionId: 'session-1', cwd: '/work' })

  assert.deepEqual(calls.create, [{
    sessionId: 'session-1',
    meta: { cwd: '/work' },
    agentOptions: {
      provider: 'magpie-responses',
      model: 'grok/grok-4.7',
      reasoningEffort: 'high',
    },
  }])
  assert.deepEqual(calls.resume, [{
    resumeSessionId: 'session-1',
    agentOptions: {
      provider: 'magpie-responses',
      model: 'grok/grok-4.7',
      reasoningEffort: 'high',
    },
  }])
})

test('an explicit launch route is recorded with model.select', async () => {
  const selected: unknown[] = []
  const calls = { create: [] as unknown[], resume: [] as unknown[] }
  const ctx = harness({ provider: 'magpie-responses', model: 'grok/grok-4.7' }, calls)
  const created = ctx.agents.create
  ctx.agents.create = async (options) => {
    const handle = await created(options)
    handle.agent.model = {
      select(selection) {
        selected.push(selection)
      },
    }
    return handle
  }
  const config = normalizeConfig({ provider: '', model: '' })
  const port = createDshAgentPort(ctx, config, silent)
  await port.create({
    sessionId: 'session-opus',
    cwd: '/work',
    provider: 'magpie-anthropic',
    model: 'rootflowai-2/claude-opus-5-5',
  })
  assert.equal(selected.length, 1)
  assert.deepEqual(selected[0], {
    provider: 'magpie-anthropic',
    model: 'rootflowai-2/claude-opus-5-5',
  })
  const createdOptions = calls.create[0] as { agentOptions: { provider: string; model: string } }
  assert.equal(createdOptions.agentOptions.provider, 'magpie-anthropic')
  assert.equal(createdOptions.agentOptions.model, 'rootflowai-2/claude-opus-5-5')
})

test('an explicit provider and model override the profile default', async () => {
  let consulted = false
  const calls = { create: [] as unknown[], resume: [] as unknown[] }
  const ctx = harness(null, calls)
  ctx.agentDefaultModel = {
    currentSelection() {
      consulted = true
      return { provider: 'ignored', model: 'ignored' }
    },
  }
  const config = normalizeConfig({ provider: 'other-provider', model: 'other-model' })
  const port = createDshAgentPort(ctx, config, silent)
  await port.create({ sessionId: 'session-2', cwd: '/work' })
  assert.equal(consulted, false)
  assert.deepEqual(calls.create[0], {
    sessionId: 'session-2',
    meta: { cwd: '/work' },
    agentOptions: { provider: 'other-provider', model: 'other-model' },
  })
})

test('create does not start a session when the profile default is missing', async () => {
  const calls = { create: [] as unknown[], resume: [] as unknown[] }
  const ctx = harness({ provider: '', model: '' }, calls)
  const config = normalizeConfig({})
  const port = createDshAgentPort(ctx, config, silent)
  await assert.rejects(
    () => port.create({ sessionId: 'session-3', cwd: '/work' }),
    /agent-default-model/,
  )
  assert.equal(calls.create.length, 0)
})
