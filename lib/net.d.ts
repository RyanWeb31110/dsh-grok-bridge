/** Tailscale IPv4 addresses sit in the CGNAT range 100.64.0.0/10. */
export declare function isTailscaleIPv4(host: string): boolean;
export declare function isLoopbackHost(host: string): boolean;
/**
 * Warn when the bind address is reachable beyond the tailnet.
 * `0.0.0.0` is allowed (tailscale serve, or an ACL in front) but called out.
 */
export declare function bindWarning(host: string): string | undefined;
export declare function isTailnetWebhookUrl(raw: string): boolean;
//# sourceMappingURL=net.d.ts.map