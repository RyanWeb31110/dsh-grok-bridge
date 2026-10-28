import Schema from '@deepseek-ai/schemastery';
/**
 * Cordis reads this export and fills defaults before `apply`.
 * Keep the defaults aligned with `normalizeConfig`.
 */
export const Config = Schema.object({
    host: Schema.string().default('127.0.0.1')
        .description('Bind address. Loopback behind tailscale serve, a 100.x address, or 0.0.0.0 only with an ACL.'),
    port: Schema.number().default(8791)
        .description('TCP port. 8791 avoids the common webhook-bridge default.'),
    token: Schema.string().default('')
        .description('Inbound bearer token. Empty rejects every /v1 request.'),
    storePath: Schema.string().default('')
        .description('Task store JSON path. Empty uses $DSH_HOME/dsh-grok-bridge/tasks.json.'),
    cwd: Schema.string().default('')
        .description('Default working directory when a task omits cwd.'),
    cwdAllowlist: Schema.string().default('')
        .description('Comma-separated absolute directory prefixes. Empty allows any cwd.'),
    provider: Schema.string().default('')
        .description('Model provider. Set together with model, or leave both empty.'),
    model: Schema.string().default('')
        .description('Model id. Set together with provider, or leave both empty.'),
    outboundWebhookUrl: Schema.string().default('')
        .description('Default URL for task events. Prefer a tailnet address.'),
    outboundToken: Schema.string().default('')
        .description('Bearer token and X-Automation-Key sent on outbound events.'),
    outboundHmacSecret: Schema.string().default('')
        .description('HMAC-SHA256 secret for X-Dsh-Signature. May match the bearer token.'),
    heartbeatMs: Schema.number().default(0)
        .description('Heartbeat interval in ms. 0 disables. Values below 60000 are raised.'),
    webhookCompleted: Schema.string().default('')
        .description('Override URL for task.completed.'),
    webhookFailed: Schema.string().default('')
        .description('Override URL for task.failed.'),
    webhookNeedsApproval: Schema.string().default('')
        .description('Override URL for task.needs_approval.'),
    webhookHeartbeat: Schema.string().default('')
        .description('Override URL for heartbeat.'),
    maxBodyBytes: Schema.number().default(1_048_576)
        .description('Maximum inbound JSON body size.'),
    maxTasks: Schema.number().default(500)
        .description('How many tasks to keep before old terminal rows are dropped.'),
});
//# sourceMappingURL=schema.js.map