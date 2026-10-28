import type { BridgeConfig } from './config.js';
import type { Logger } from './logger.js';
import type { TaskService } from './service.js';
export interface RunningBridge {
    port: number;
    close(): Promise<void>;
}
export declare function startBridge(options: {
    config: BridgeConfig;
    service: TaskService;
    logger: Logger;
    fetchImpl?: typeof fetch;
}): Promise<RunningBridge>;
//# sourceMappingURL=runtime.d.ts.map