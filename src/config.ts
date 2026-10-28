import { homedir } from 'node:os'
import path from 'node:path'

export interface BridgeConfig {
  host: string
  port: number
  token: string
  storePath: string
  cwd: string
  cwdAllowlist: string[]
  provider: string
  model: string
  outboundWebhookUrl: string
  outboundToken: string
  outboundHmacSecret: string
  heartbeatMs: number
  webhookCompleted: string
  webhookFailed: string
  webhookNeedsApproval: string
  webhookHeartbeat: string
  maxBodyBytes: number
  maxTasks: number
}

const MIN_HEARTBEAT_MS = 60_000
const DEFAULT_MAX_BODY = 1_048_576

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function integer(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  return fallback
}

export function defaultStorePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DSH_HOME?.trim()
  const root = configured && configured.length > 0 ? configured : path.join(homedir(), '.dsh')
  return path.join(root, 'dsh-grok-bridge', 'tasks.json')
}

/** Values coming from cordis, YAML, or the environment before normalization. */
export interface RawConfig {
  host?: unknown
  port?: unknown
  token?: unknown
  storePath?: unknown
  cwd?: unknown
  cwdAllowlist?: unknown
  provider?: unknown
  model?: unknown
  outboundWebhookUrl?: unknown
  outboundToken?: unknown
  outboundHmacSecret?: unknown
  heartbeatMs?: unknown
  webhookCompleted?: unknown
  webhookFailed?: unknown
  webhookNeedsApproval?: unknown
  webhookHeartbeat?: unknown
  maxBodyBytes?: unknown
  maxTasks?: unknown
}

function allowlistOf(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map((entry) => String(entry)).join(',')
    : typeof value === 'string'
      ? value
      : ''
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => path.resolve(entry))
}

export function normalizeConfig(input: RawConfig = {}, env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const port = integer(input.port, 8791)
  if (port < 0 || port > 65535) {
    throw new Error(`dsh-grok-bridge: port ${port} is outside 0-65535`)
  }
  let heartbeatMs = integer(input.heartbeatMs, 0)
  if (heartbeatMs < 0) heartbeatMs = 0
  if (heartbeatMs > 0 && heartbeatMs < MIN_HEARTBEAT_MS) heartbeatMs = MIN_HEARTBEAT_MS

  const storeConfigured = text(input.storePath)
  const cwdConfigured = text(input.cwd)
  const allowlist = allowlistOf(input.cwdAllowlist)

  let maxBodyBytes = integer(input.maxBodyBytes, DEFAULT_MAX_BODY)
  if (maxBodyBytes < 1024) maxBodyBytes = 1024
  if (maxBodyBytes > 10_000_000) maxBodyBytes = 10_000_000

  let maxTasks = integer(input.maxTasks, 500)
  if (maxTasks < 1) maxTasks = 1

  return {
    host: text(input.host, '127.0.0.1') || '127.0.0.1',
    port,
    token: text(input.token),
    storePath: storeConfigured ? path.resolve(storeConfigured) : defaultStorePath(env),
    cwd: cwdConfigured ? path.resolve(cwdConfigured) : path.resolve(process.cwd()),
    cwdAllowlist: allowlist,
    provider: text(input.provider),
    model: text(input.model),
    outboundWebhookUrl: text(input.outboundWebhookUrl),
    outboundToken: text(input.outboundToken),
    outboundHmacSecret: text(input.outboundHmacSecret),
    heartbeatMs,
    webhookCompleted: text(input.webhookCompleted),
    webhookFailed: text(input.webhookFailed),
    webhookNeedsApproval: text(input.webhookNeedsApproval),
    webhookHeartbeat: text(input.webhookHeartbeat),
    maxBodyBytes,
    maxTasks,
  }
}

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  return normalizeConfig({
    host: env.DSH_GROK_BIND,
    port: env.DSH_GROK_PORT === undefined ? undefined : Number(env.DSH_GROK_PORT),
    token: env.DSH_GROK_TOKEN,
    storePath: env.DSH_GROK_STORE,
    cwd: env.DSH_GROK_CWD,
    cwdAllowlist: env.DSH_GROK_CWD_ALLOWLIST === undefined
      ? undefined
      : env.DSH_GROK_CWD_ALLOWLIST.split(',').map((entry) => entry.trim()).filter(Boolean),
    provider: env.DSH_GROK_PROVIDER,
    model: env.DSH_GROK_MODEL,
    outboundWebhookUrl: env.DSH_GROK_OUTBOUND_WEBHOOK_URL,
    outboundToken: env.DSH_GROK_OUTBOUND_TOKEN,
    outboundHmacSecret: env.DSH_GROK_OUTBOUND_HMAC_SECRET,
    heartbeatMs: env.DSH_GROK_HEARTBEAT_MS === undefined ? undefined : Number(env.DSH_GROK_HEARTBEAT_MS),
    webhookCompleted: env.DSH_GROK_WEBHOOK_COMPLETED,
    webhookFailed: env.DSH_GROK_WEBHOOK_FAILED,
    webhookNeedsApproval: env.DSH_GROK_WEBHOOK_NEEDS_APPROVAL,
    webhookHeartbeat: env.DSH_GROK_WEBHOOK_HEARTBEAT,
  }, env)
}

export function modelRoute(config: BridgeConfig): { provider: string; model: string } | undefined {
  if (config.provider && config.model) return { provider: config.provider, model: config.model }
  return undefined
}

/** True when `cwd` is the allowlist root or a directory inside it. Empty allowlist permits any path. */
export function cwdAllowed(cwd: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return true
  const resolved = path.resolve(cwd)
  return allowlist.some((root) => {
    const base = path.resolve(root)
    return resolved === base || resolved.startsWith(base.endsWith(path.sep) ? base : base + path.sep)
  })
}
