export const TASK_STATUSES = [
    'queued',
    'running',
    'needs_approval',
    'completed',
    'failed',
    'canceled',
];
export const TERMINAL_STATUSES = ['completed', 'failed', 'canceled'];
export function isTerminal(status) {
    return status === 'completed' || status === 'failed' || status === 'canceled';
}
export function toPublicTask(task) {
    const pub = {
        id: task.id,
        sessionId: task.sessionId,
        status: task.status,
        title: task.title,
        prompt: task.prompt,
        cwd: task.cwd,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        revision: task.revision,
        steerCount: task.steerCount,
    };
    if (task.resultText !== undefined)
        pub.resultText = task.resultText;
    if (task.resultTruncated)
        pub.resultTruncated = true;
    if (task.error !== undefined)
        pub.error = task.error;
    if (task.endReason !== undefined)
        pub.endReason = task.endReason;
    if (task.approval !== undefined)
        pub.approval = task.approval;
    if (task.provider !== undefined)
        pub.provider = task.provider;
    if (task.model !== undefined)
        pub.model = task.model;
    if (task.metadata !== undefined)
        pub.metadata = task.metadata;
    return pub;
}
//# sourceMappingURL=types.js.map