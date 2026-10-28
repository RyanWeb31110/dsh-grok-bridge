import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readSessionEvent, sessionIdOf } from '../src/events.ts'
import { userMessage } from '../src/message.ts'
import { bindWarning, isTailscaleIPv4 } from '../src/net.ts'
import { cwdAllowed, normalizeConfig } from '../src/config.ts'

test('user messages include the fields the harness persists', () => {
  const message = userMessage('hello')
  assert.equal(message.role, 'user')
  assert.equal(message.source.kind, 'user')
  assert.equal(message.content[0]?.text, 'hello')
  assert.equal(typeof message.id, 'string')
  assert.ok(message.id.length > 0)
  assert.equal(Object.isFrozen(message), true)
})

test('session events expose assistant text and turn endings', () => {
  const text = readSessionEvent({
    type: 'assistant/message',
    data: { message: { content: [{ type: 'text', text: 'done' }, { type: 'image' }] } },
  })
  assert.deepEqual(text, { kind: 'assistant', text: 'done' })

  const failure = readSessionEvent({
    type: 'turn/end',
    data: { reason: { kind: 'error', error: { message: 'boom' } } },
  })
  assert.deepEqual(failure, { kind: 'turn-end', reason: 'error', error: 'boom' })
  assert.equal(sessionIdOf({ session: { id: 'sess-1' } }), 'sess-1')
  assert.equal(readSessionEvent({ type: 'tool/result' }), undefined)
})

test('bind and cwd checks match the tailnet rules', () => {
  assert.equal(isTailscaleIPv4('100.64.0.1'), true)
  assert.equal(isTailscaleIPv4('100.127.255.255'), true)
  assert.equal(isTailscaleIPv4('100.63.1.1'), false)
  assert.equal(isTailscaleIPv4('100.128.0.1'), false)
  assert.equal(isTailscaleIPv4('8.8.8.8'), false)
  assert.equal(bindWarning('127.0.0.1'), undefined)
  assert.equal(bindWarning('100.89.1.2'), undefined)
  assert.match(bindWarning('0.0.0.0') ?? '', /all interfaces/)
  assert.match(bindWarning('192.168.1.9') ?? '', /not loopback/)

  assert.equal(cwdAllowed('/work/app', ['/work']), true)
  assert.equal(cwdAllowed('/work', ['/work']), true)
  assert.equal(cwdAllowed('/etc', ['/work']), false)
  assert.equal(cwdAllowed('/elsewhere', []), true)

  const config = normalizeConfig({ heartbeatMs: 1000, port: 8791, token: '  abc  ' })
  assert.equal(config.heartbeatMs, 60_000)
  assert.equal(config.token, 'abc')
  assert.throws(() => normalizeConfig({ port: 70_000 }), /port/)
})
