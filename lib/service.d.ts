import type { BridgeConfig } from './config.js';
import type { Logger } from './logger.js';
import type { TaskStore } from './store.js';
import { type ApprovalInfo, type OutboundEnvelope, type PublicTask } from './types.js';
export interface AgentLaunch {
    sessionId: string;
    cwd: string;
    provider?: string;
    model?: string;
}
/** Harness calls, behind an interface so tests never boot dsh. */
export interface AgentPort {
    has(sessionId: string): boolean;
    create(input: AgentLaunch): Promise<void>;
    resume(input: AgentLaunch): Promise<void>;
    followup(sessionId: string, text: string): void;
    steer(sessionId: string, text: string): void;
    disposeAll(): Promise<void>;
}
export interface CreateTaskInput {
    prompt?: unknown;
    cwd?: unknown;
    title?: unknown;
    metadata?: unknown;
}
export interface TaskService {
    createTask(input: CreateTaskInput, idempotencyKey?: string): Promise<{
        task: PublicTask;
        created: boolean;
    }>;
    listTasks(limit: number): PublicTask[];
    getTask(id: string): PublicTask | undefined;
    steer(id: string, text: string): Promise<PublicTask>;
    onStatus(sessionId: string, status: string): void;
    onAssistantText(sessionId: string, text: string): void;
    onTurnEnd(sessionId: string, reason: string, error?: string): void;
    onApproval(sessionId: string, approval: Omit<ApprovalInfo, 'requestedAt'>): void;
    onAgentError(sessionId: string, message: string): void;
    resumeActive(): Promise<void>;
    shutdown(): Promise<void>;
    counts(): {
        total: number;
        running: number;
        needsApproval: number;
    };
    heartbeatEvent(): OutboundEnvelope;
}
export interface ServiceOptions {
    config: BridgeConfig;
    store: TaskStore;
    driver: AgentPort;
    logger: Logger;
    fetchImpl?: typeof fetch;
    /** Wall clock for tests. Defaults to `Date`. */
    now?: () => Date;
}
export declare function assertIdempotencyKey(key: string | undefined): string | undefined;
export declare function isTaskId(id: string): boolean;
export declare function createTaskService(options: ServiceOptions): TaskService;
//# sourceMappingURL=service.d.ts.map