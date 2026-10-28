import { type Server } from 'node:http';
import type { BridgeConfig } from './config.js';
import type { Logger } from './logger.js';
import { type TaskService } from './service.js';
export declare function createHttpServer(config: BridgeConfig, service: TaskService, logger: Logger): Server;
export declare function listen(server: Server, host: string, port: number): Promise<number>;
export declare function closeServer(server: Server): Promise<void>;
//# sourceMappingURL=http.d.ts.map