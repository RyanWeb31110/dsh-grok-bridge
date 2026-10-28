export declare const TASK_STATUSES: readonly ["queued", "running", "needs_approval", "completed", "failed", "canceled"];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export declare const TERMINAL_STATUSES: readonly TaskStatus[];
export declare function isTerminal(status: TaskStatus): boolean;
export interface ApprovalInfo {
    toolName: string;
    reason?: string;
    callId?: string;
    requestedAt: string;
}
/** Durable task row. `sessionReady` is internal and is not part of the HTTP body. */
export interface TaskRecord {
    id: string;
    sessionId: string;
    status: TaskStatus;
    title: string;
    prompt: string;
    cwd: string;
    createdAt: string;
    updatedAt: string;
    revision: number;
    sessionReady: boolean;
    steerCount: number;
    resultText?: string;
    resultTruncated?: boolean;
    error?: string;
    endReason?: string;
    approval?: ApprovalInfo;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
}
export interface PublicTask {
    id: string;
    sessionId: string;
    status: TaskStatus;
    title: string;
    prompt: string;
    cwd: string;
    createdAt: string;
    updatedAt: string;
    revision: number;
    steerCount: number;
    resultText?: string;
    resultTruncated?: boolean;
    error?: string;
    endReason?: string;
    approval?: ApprovalInfo;
    metadata?: Record<string, unknown>;
}
export declare function toPublicTask(task: TaskRecord): PublicTask;
export type OutboundEventType = 'task.completed' | 'task.failed' | 'task.needs_approval' | 'heartbeat';
export interface OutboundEnvelope {
    type: OutboundEventType;
    id: string;
    ts: string;
    bridge: 'dsh-grok-bridge';
    version: string;
    task?: PublicTask;
    uptimeSec?: number;
    tasks?: {
        total: number;
        running: number;
        needsApproval: number;
    };
}
//# sourceMappingURL=types.d.ts.map