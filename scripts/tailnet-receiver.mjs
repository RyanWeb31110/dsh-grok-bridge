#!/usr/bin/env node
/**
 * Tiny tailnet receiver for dsh-grok-bridge events.
 * Verifies the bearer token and HMAC, appends the JSON line to a log, and
 * optionally forwards the same body to a Grok Bot routine webhook.
 *
 * Run from the repo root: `node scripts/tailnet-receiver.mjs`
 */
import { createServer } from 'node:http'
import { appendFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const authPath = path.join(here, '..', 'lib', 'auth.js')
if (!existsSync(authPath)) {
  console.error('dsh-grok-bridge: build first (npm run build) so lib/auth.js exists')
  process.exit(1)
}

const { authorized, timestampFresh, verifySignature } = await import(pathToFileURL(authPath).href)

const bind = process.env.RECEIVER_BIND || '127.0.0.1'
const port = Number(process.env.RECEIVER_PORT || 8792)
const token = process.env.RECEIVER_TOKEN || ''
const hmac = process.env.RECEIVER_HMAC_SECRET || ''
const logFile = process.env.RECEIVER_LOG || ''
const forwardUrl = process.env.FORWARD_URL || ''
const forwardToken = process.env.FORWARD_TOKEN || ''

if (!token && !hmac) {
  console.error('Set RECEIVER_TOKEN and/or RECEIVER_HMAC_SECRET. Refusing to run open.')
  process.exit(1)
}

function readBody(req, max = 1_048_576) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > max) {
        reject(new Error('too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(payload)
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (req.method === 'GET' && url.pathname === '/healthz') {
      send(res, 200, { ok: true, name: 'dsh-grok-bridge-receiver' })
      return
    }
    if (req.method !== 'POST') {
      send(res, 404, { ok: false, error: 'not_found' })
      return
    }
    let raw = ''
    try {
      raw = await readBody(req)
    } catch {
      send(res, 413, { ok: false, error: 'payload_too_large' })
      return
    }
    if (token && !authorized(req.headers.authorization, token)) {
      send(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    const timestamp = String(req.headers['x-dsh-timestamp'] || '')
    if (hmac) {
      if (!timestampFresh(timestamp)) {
        send(res, 401, { ok: false, error: 'stale_timestamp' })
        return
      }
      const signature = String(req.headers['x-dsh-signature'] || '')
      if (!verifySignature(hmac, timestamp, raw, signature)) {
        send(res, 401, { ok: false, error: 'bad_signature' })
        return
      }
    }
    if (logFile) appendFileSync(logFile, `${raw}\n`, { mode: 0o600 })
    if (forwardUrl) {
      void fetch(forwardUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          ...(forwardToken
            ? { authorization: `Bearer ${forwardToken}`, 'x-automation-key': forwardToken }
            : {}),
        },
        body: raw,
        signal: AbortSignal.timeout(8_000),
      }).then((response) => {
        if (!response.ok) console.warn(`forward returned HTTP ${response.status}`)
      }).catch((error) => {
        console.warn(`forward failed: ${error instanceof Error ? error.message : 'unknown'}`)
      })
    }
    send(res, 200, { ok: true })
  })().catch((error) => {
    console.warn(error instanceof Error ? error.message : error)
    if (!res.headersSent) send(res, 500, { ok: false, error: 'internal' })
  })
})

server.listen(port, bind, () => {
  console.log(`dsh-grok-bridge receiver on http://${bind}:${port}`)
})
