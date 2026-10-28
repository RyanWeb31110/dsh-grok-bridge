import type { Logger } from './logger.js';
import type { TaskService } from './service.js';
interface EventContext {
    on(name: string, listener: (...args: any[]) => unknown): unknown;
}
/**
 * Observe harness events for tasks this bridge owns.
 * `approval/request` is a waterfall: always call `next()` so the bridge
 * never grants or swallows a tool approval.
 */
export declare function attachLifecycle(ctx: EventContext, service: TaskService, logger: Logger): void;
export {};
//# sourceMappingURL=lifecycle.d.ts.map