import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Config, apply, inject, name } from '../src/index.ts'

test('the package is a dsh bundle plugin', () => {
  assert.equal(name, 'dsh-grok-bridge')
  assert.deepEqual(inject, ['agents', 'sessions', 'sessionPersistence', 'agentDefaultModel'])
  assert.equal(typeof apply, 'function')
  const defaults = Config({}) as { port: number; token: string; heartbeatMs: number }
  assert.equal(defaults.port, 8791)
  assert.equal(defaults.token, '')
  assert.equal(defaults.heartbeatMs, 0)
})
