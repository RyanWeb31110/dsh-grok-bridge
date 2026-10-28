export interface BridgeConfig {
    host: string;
    port: number;
    token: string;
    storePath: string;
    cwd: string;
    cwdAllowlist: string[];
    provider: string;
    model: string;
    outboundWebhookUrl: string;
    outboundToken: string;
    outboundHmacSecret: string;
    heartbeatMs: number;
    webhookCompleted: string;
    webhookFailed: string;
    webhookNeedsApproval: string;
    webhookHeartbeat: string;
    maxBodyBytes: number;
    maxTasks: number;
}
export declare function defaultStorePath(env?: NodeJS.ProcessEnv): string;
/** Values coming from cordis, YAML, or the environment before normalization. */
export interface RawConfig {
    host?: unknown;
    port?: unknown;
    token?: unknown;
    storePath?: unknown;
    cwd?: unknown;
    cwdAllowlist?: unknown;
    provider?: unknown;
    model?: unknown;
    outboundWebhookUrl?: unknown;
    outboundToken?: unknown;
    outboundHmacSecret?: unknown;
    heartbeatMs?: unknown;
    webhookCompleted?: unknown;
    webhookFailed?: unknown;
    webhookNeedsApproval?: unknown;
    webhookHeartbeat?: unknown;
    maxBodyBytes?: unknown;
    maxTasks?: unknown;
}
export declare function normalizeConfig(input?: RawConfig, env?: NodeJS.ProcessEnv): BridgeConfig;
export declare function loadConfigFromEnv(env?: NodeJS.ProcessEnv): BridgeConfig;
export declare function modelRoute(config: BridgeConfig): {
    provider: string;
    model: string;
} | undefined;
/** True when `cwd` is the allowlist root or a directory inside it. Empty allowlist permits any path. */
export declare function cwdAllowed(cwd: string, allowlist: readonly string[]): boolean;
//# sourceMappingURL=config.d.ts.map