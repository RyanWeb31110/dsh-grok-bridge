#!/usr/bin/env node
/**
 * Local simulator. It is not the dsh plugin.
 * A follow-up finishes after DSH_GROK_DEMO_DELAY_MS so the HTTP and webhook
 * loop can be exercised without a harness or a model.
 */
import { loadConfigFromEnv } from './config.js';
import { pluginLogger } from './logger.js';
import { startBridge } from './runtime.js';
import { createTaskService } from './service.js';
import { openTaskStore } from './store.js';
function delayMs() {
    const raw = Number(process.env.DSH_GROK_DEMO_DELAY_MS ?? 200);
    return Number.isFinite(raw) && raw >= 0 ? raw : 200;
}
function demoDriver(service) {
    const live = new Set();
    const delay = delayMs();
    const finish = (sessionId, text) => {
        setTimeout(() => {
            const current = service();
            current.onAssistantText(sessionId, `Finished: ${text.slice(0, 240)}`);
            current.onTurnEnd(sessionId, 'completed');
        }, delay);
    };
    return {
        has(sessionId) {
            return live.has(sessionId);
        },
        async create({ sessionId }) {
            live.add(sessionId);
        },
        async resume({ sessionId }) {
            live.add(sessionId);
        },
        followup(sessionId, text) {
            finish(sessionId, text);
        },
        steer(sessionId, text) {
            finish(sessionId, text);
        },
        async disposeAll() {
            live.clear();
        },
    };
}
async function main() {
    const config = loadConfigFromEnv();
    const logger = pluginLogger({});
    const store = openTaskStore(config.storePath, config.maxTasks);
    let service;
    const driver = demoDriver(() => {
        if (!service)
            throw new Error('service not ready');
        return service;
    });
    service = createTaskService({ config, store, driver, logger });
    const bridge = await startBridge({ config, service, logger });
    logger.info('demo simulator ready — not connected to dsh');
    const shutdown = () => {
        void bridge.close().then(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map