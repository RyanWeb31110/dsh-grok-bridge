import type { TaskRecord } from './types.js';
/**
 * JSON task map. Writes are synchronous and atomic (temp file, fsync, rename)
 * so a crash mid-write keeps the previous file. Mode 0600.
 */
export declare class TaskStore {
    readonly file: string;
    private maxTasks;
    private readonly byId;
    constructor(file: string, maxTasks?: number);
    private load;
    private persist;
    get size(): number;
    get(id: string): TaskRecord | undefined;
    findBySession(sessionId: string): TaskRecord | undefined;
    findByIdempotency(key: string): TaskRecord | undefined;
    list(): TaskRecord[];
    upsert(task: TaskRecord): TaskRecord;
    /** Drop the oldest terminal tasks once the file grows past `maxTasks`. Active tasks stay. */
    private prune;
    /** Test hook so prune can be driven without a huge fixture. */
    pruneTo(maxTasks: number): void;
}
export declare function openTaskStore(file: string, maxTasks?: number): TaskStore;
//# sourceMappingURL=store.d.ts.map