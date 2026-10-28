import type { BridgeConfig } from './config.js';
import type { Logger } from './logger.js';
import type { AgentPort } from './service.js';
interface AgentHandle {
    agent: {
        followup(message: unknown): unknown;
        steer(message: unknown): unknown;
    };
    dispose?: () => Promise<void>;
}
interface AgentRegistry {
    create(options: Record<string, unknown>): Promise<AgentHandle>;
    resume(options: Record<string, unknown>): Promise<AgentHandle>;
}
/**
 * Minimal slice of the Cordis context this plugin touches.
 * Typed locally so the package does not import `@deepseek-ai/dsh-*`
 * (those modules must stay the host's single copy).
 */
export interface DshContext {
    agents: AgentRegistry;
    on(name: string, listener: (...args: any[]) => unknown): unknown;
    effect(callback: () => void | (() => void)): unknown;
    logger?: unknown;
}
/**
 * Live agents created through `ctx.agents`. Messages include `id`, `role`,
 * `content`, and `source` — the same shape as `createUserMessage`.
 */
export declare function createDshAgentPort(ctx: DshContext, config: BridgeConfig, logger: Logger): AgentPort;
export {};
//# sourceMappingURL=agent-port.d.ts.map