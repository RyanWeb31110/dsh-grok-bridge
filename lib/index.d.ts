import { type RawConfig } from './config.js';
import { type DshContext } from './agent-port.js';
import { Config } from './schema.js';
export declare const name = "dsh-grok-bridge";
/** Wait for the agent registry and the persistence service the resume path needs. */
export declare const inject: string[];
export { Config };
/**
 * In-process DeepSeek Harness plugin.
 * Grok calls the HTTP API; dsh session events leave as signed webhooks.
 */
export declare function apply(ctx: DshContext, rawConfig?: RawConfig): void;
//# sourceMappingURL=index.d.ts.map