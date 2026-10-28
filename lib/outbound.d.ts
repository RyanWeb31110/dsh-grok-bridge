import type { BridgeConfig } from './config.js';
import type { Logger } from './logger.js';
import type { OutboundEnvelope, OutboundEventType, PublicTask } from './types.js';
export declare function webhookUrlFor(config: BridgeConfig, type: OutboundEventType): string;
export declare function clipTask(task: PublicTask): PublicTask;
export declare function eventId(): string;
export interface PostResult {
    sent: boolean;
    status?: number;
}
export declare function postEvent(config: BridgeConfig, event: OutboundEnvelope, logger: Logger, fetchImpl?: typeof fetch): Promise<PostResult>;
//# sourceMappingURL=outbound.d.ts.map