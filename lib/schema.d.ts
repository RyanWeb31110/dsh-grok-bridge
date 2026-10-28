import Schema from '@deepseek-ai/schemastery';
/**
 * Cordis reads this export and fills defaults before `apply`.
 * Keep the defaults aligned with `normalizeConfig`.
 */
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    host: Schema<string, string, "defined">;
    port: Schema<number, number, "defined">;
    token: Schema<string, string, "defined">;
    storePath: Schema<string, string, "defined">;
    cwd: Schema<string, string, "defined">;
    cwdAllowlist: Schema<string, string, "defined">;
    provider: Schema<string, string, "defined">;
    model: Schema<string, string, "defined">;
    outboundWebhookUrl: Schema<string, string, "defined">;
    outboundToken: Schema<string, string, "defined">;
    outboundHmacSecret: Schema<string, string, "defined">;
    heartbeatMs: Schema<number, number, "defined">;
    webhookCompleted: Schema<string, string, "defined">;
    webhookFailed: Schema<string, string, "defined">;
    webhookNeedsApproval: Schema<string, string, "defined">;
    webhookHeartbeat: Schema<string, string, "defined">;
    maxBodyBytes: Schema<number, number, "defined">;
    maxTasks: Schema<number, number, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    host: Schema<string, string, "defined">;
    port: Schema<number, number, "defined">;
    token: Schema<string, string, "defined">;
    storePath: Schema<string, string, "defined">;
    cwd: Schema<string, string, "defined">;
    cwdAllowlist: Schema<string, string, "defined">;
    provider: Schema<string, string, "defined">;
    model: Schema<string, string, "defined">;
    outboundWebhookUrl: Schema<string, string, "defined">;
    outboundToken: Schema<string, string, "defined">;
    outboundHmacSecret: Schema<string, string, "defined">;
    heartbeatMs: Schema<number, number, "defined">;
    webhookCompleted: Schema<string, string, "defined">;
    webhookFailed: Schema<string, string, "defined">;
    webhookNeedsApproval: Schema<string, string, "defined">;
    webhookHeartbeat: Schema<string, string, "defined">;
    maxBodyBytes: Schema<number, number, "defined">;
    maxTasks: Schema<number, number, "defined">;
}>>, "plain">;
//# sourceMappingURL=schema.d.ts.map