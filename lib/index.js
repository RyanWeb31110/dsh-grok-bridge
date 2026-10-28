import { normalizeConfig } from './config.js';
import { createDshAgentPort } from './agent-port.js';
import { attachLifecycle } from './lifecycle.js';
import { pluginLogger } from './logger.js';
import { startBridge } from './runtime.js';
import { Config } from './schema.js';
import { createTaskService } from './service.js';
import { openTaskStore } from './store.js';
export const name = 'dsh-grok-bridge';
/** Wait for the agent registry and the persistence service the resume path needs. */
export const inject = ['agents', 'sessions', 'sessionPersistence'];
export { Config };
/**
 * In-process DeepSeek Harness plugin.
 * Grok calls the HTTP API; dsh session events leave as signed webhooks.
 */
export function apply(ctx, rawConfig = {}) {
    const config = normalizeConfig(rawConfig);
    const logger = pluginLogger(ctx);
    const store = openTaskStore(config.storePath, config.maxTasks);
    const driver = createDshAgentPort(ctx, config, logger);
    const service = createTaskService({ config, store, driver, logger });
    attachLifecycle(ctx, service, logger);
    let close;
    ctx.effect(() => {
        let stopped = false;
        void startBridge({ config, service, logger }).then((bridge) => {
            close = () => bridge.close();
            if (stopped)
                void close();
        }).catch((error) => {
            logger.warn(`failed to listen: ${error instanceof Error ? error.message : 'unknown'}`);
        });
        return () => {
            stopped = true;
            void close?.();
        };
    });
}
//# sourceMappingURL=index.js.map