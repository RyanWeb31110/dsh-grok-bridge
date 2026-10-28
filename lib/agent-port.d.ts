import type { BridgeConfig } from './config.js';
import type { Logger } from './logger.js';
import type { AgentPort } from './service.js';
interface SelectableModel {
    select?(selection: {
        provider: string;
        model: string;
        reasoningEffort?: string;
    }): void;
}
interface AgentHandle {
    agent: {
        followup(message: unknown): unknown;
        steer(message: unknown): unknown;
        /** Present on dsh 0.2 agents. Writes the durable `model/selection` the desktop picker reads. */
        model?: SelectableModel;
    };
    dispose?: () => Promise<void>;
}
interface AgentRegistry {
    create(options: Record<string, unknown>): Promise<AgentHandle>;
    resume(options: Record<string, unknown>): Promise<AgentHandle>;
}
/** Live profile default, the same route a new desktop chat starts on. */
export interface DefaultModelService {
    currentSelection?: (() => unknown) | unknown;
}
/**
 * Minimal slice of the Cordis context this plugin touches.
 * Typed locally so the package does not import `@deepseek-ai/dsh-*`
 * (those modules must stay the host's single copy).
 */
export interface DshContext {
    agents: AgentRegistry;
    /** Present on stock profiles as the `agent-default-model` row. */
    agentDefaultModel?: DefaultModelService;
    on(name: string, listener: (...args: any[]) => unknown): unknown;
    effect(callback: () => void | (() => void)): unknown;
    logger?: unknown;
}
export interface ResolvedRoute {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
/** Read `ctx.agentDefaultModel.currentSelection()` without assuming a method vs a snapshot. */
export declare function readProfileDefault(service: DefaultModelService | undefined): ResolvedRoute | undefined;
/**
 * Live agents created through `ctx.agents`. Messages include `id`, `role`,
 * `content`, and `source` — the same shape as `createUserMessage`.
 */
export declare function createDshAgentPort(ctx: DshContext, config: BridgeConfig, logger: Logger): AgentPort;
export {};
//# sourceMappingURL=agent-port.d.ts.map