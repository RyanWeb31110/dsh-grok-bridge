import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openTaskStore } from '../src/store.ts'
import type { TaskRecord } from '../src/types.ts'

function sample(id: string, sessionId: string): TaskRecord {
  return {
    id,
    sessionId,
    status: 'queued',
    title: 'hello',
    prompt: 'Say hello',
    cwd: '/work',
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
    revision: 0,
    sessionReady: true,
    steerCount: 0,
  }
}

test('task map survives a new store instance and is mode 0600', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-grok-store-'))
  try {
    const file = path.join(dir, 'nested', 'tasks.json')
    const first = openTaskStore(file)
    const saved = first.upsert(sample('task_abc', 'session-1'))
    assert.equal(saved.revision, 1)
    assert.equal(saved.sessionId, 'session-1')

    const second = openTaskStore(file)
    const loaded = second.findBySession('session-1')
    assert.ok(loaded)
    assert.equal(loaded.id, 'task_abc')
    assert.equal(loaded.prompt, 'Say hello')
    assert.equal(second.findByIdempotency('missing'), undefined)

    const mode = statSync(file).mode & 0o777
    assert.equal(mode, 0o600)
    const dirMode = statSync(path.dirname(file)).mode & 0o777
    assert.equal(dirMode, 0o700)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a corrupt store is refused instead of being replaced', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-grok-store-'))
  try {
    const file = path.join(dir, 'tasks.json')
    writeFileSync(file, '{', { mode: 0o600 })
    assert.throws(() => openTaskStore(file), /not JSON/)
    assert.equal(readFileSync(file, 'utf8'), '{')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('old terminal tasks are pruned and active tasks stay', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-grok-store-'))
  try {
    const file = path.join(dir, 'tasks.json')
    const store = openTaskStore(file, 2)
    store.upsert({ ...sample('task_old', 's-old'), status: 'completed', updatedAt: '2026-10-28T00:00:00.000Z' })
    store.upsert({ ...sample('task_live', 's-live'), status: 'running', updatedAt: '2026-10-28T00:00:01.000Z' })
    store.upsert({ ...sample('task_new', 's-new'), status: 'completed', updatedAt: '2026-10-28T00:00:02.000Z' })
    const ids = store.list().map((task) => task.id).sort()
    assert.deepEqual(ids, ['task_live', 'task_new'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
