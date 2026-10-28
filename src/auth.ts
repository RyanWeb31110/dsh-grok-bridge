import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Compare two strings without leaking the expected value through an early length check.
 * Digests are fixed length, so `timingSafeEqual` always runs.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  const left = createHash('sha256').update(provided).digest()
  const right = createHash('sha256').update(expected).digest()
  return timingSafeEqual(left, right)
}

/** Pull the token out of `Authorization: Bearer <token>`. */
export function bearerToken(header: string | undefined): string | undefined {
  if (typeof header !== 'string') return undefined
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header)
  return match?.[1]
}

export function authorized(header: string | undefined, expectedToken: string): boolean {
  if (expectedToken.length === 0) return false
  const provided = bearerToken(header)
  if (provided === undefined) return false
  return secretsMatch(provided, expectedToken)
}

/** HMAC-SHA256 over `timestamp + "." + rawBody`, hex-encoded. */
export function signBody(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

export function verifySignature(
  secret: string,
  timestamp: string,
  body: string,
  header: string | undefined,
): boolean {
  if (!secret || !header) return false
  const provided = header.startsWith('sha256=') ? header.slice('sha256='.length) : header
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false
  const expected = signBody(secret, timestamp, body)
  return secretsMatch(provided.toLowerCase(), expected)
}

/** Accept unix seconds (or milliseconds) within `skewSec` of now. */
export function timestampFresh(
  timestamp: string,
  nowSec = Math.floor(Date.now() / 1000),
  skewSec = 300,
): boolean {
  if (!/^\d{10,13}$/.test(timestamp)) return false
  let value = Number(timestamp)
  if (value > 1e12) value = Math.floor(value / 1000)
  return Math.abs(nowSec - value) <= skewSec
}
