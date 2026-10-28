import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authorized, bearerToken, secretsMatch, signBody, timestampFresh, verifySignature } from '../src/auth.ts'

test('bearer comparison accepts only the configured token', () => {
  const token = 'test-token-value-ok-32chars'
  assert.equal(bearerToken('Bearer test-token-value-ok-32chars'), token)
  assert.equal(bearerToken('bearer test-token-value-ok-32chars'), token)
  assert.equal(bearerToken('Basic test-token-value-ok-32chars'), undefined)
  assert.equal(authorized(`Bearer ${token}`, token), true)
  assert.equal(authorized('Bearer other-token-value-ok-32ch', token), false)
  assert.equal(authorized(undefined, token), false)
  assert.equal(authorized(`Bearer ${token}`, ''), false)
  assert.equal(secretsMatch('same', 'same'), true)
  assert.equal(secretsMatch('same', 'same-but-longer'), false)
})

test('HMAC covers the timestamp and the raw body', () => {
  const secret = 'hmac-secret-value-ok-32'
  const body = '{"type":"task.completed"}'
  const timestamp = '1700000000'
  const signature = signBody(secret, timestamp, body)
  assert.equal(verifySignature(secret, timestamp, body, `sha256=${signature}`), true)
  assert.equal(verifySignature(secret, timestamp, `${body} `, `sha256=${signature}`), false)
  assert.equal(verifySignature(secret, '1700000001', body, `sha256=${signature}`), false)
  assert.equal(verifySignature('other-secret-value-ok-32ch', timestamp, body, `sha256=${signature}`), false)
  assert.equal(verifySignature(secret, timestamp, body, 'sha256=not-a-digest'), false)
  assert.equal(timestampFresh(timestamp, 1_700_000_100), true)
  assert.equal(timestampFresh(timestamp, 1_700_000_401), false)
  assert.equal(timestampFresh('nope', 1_700_000_000), false)
})
