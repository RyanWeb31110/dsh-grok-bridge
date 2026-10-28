import { URL } from 'node:url'

/** Tailscale IPv4 addresses sit in the CGNAT range 100.64.0.0/10. */
export function isTailscaleIPv4(host: string): boolean {
  const parts = host.split('.')
  if (parts.length !== 4) return false
  const numbers = parts.map((part) => Number(part))
  if (numbers.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = numbers
  return a === 100 && b !== undefined && b >= 64 && b <= 127
}

export function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

/**
 * Warn when the bind address is reachable beyond the tailnet.
 * `0.0.0.0` is allowed (tailscale serve, or an ACL in front) but called out.
 */
export function bindWarning(host: string): string | undefined {
  if (isLoopbackHost(host)) return undefined
  if (host === '0.0.0.0' || host === '::') {
    return 'listening on all interfaces; restrict the port with a Tailscale ACL or front it with tailscale serve'
  }
  if (isTailscaleIPv4(host)) return undefined
  return `bind host ${host} is not loopback or a Tailscale 100.64.0.0/10 address`
}

export function isTailnetWebhookUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  const host = url.hostname
  if (isLoopbackHost(host) || isTailscaleIPv4(host)) return true
  return host.endsWith('.ts.net')
}
