import { chmodSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import path from 'node:path';
function isTask(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const row = value;
    return typeof row.id === 'string' && typeof row.sessionId === 'string' && typeof row.status === 'string';
}
/**
 * JSON task map. Writes are synchronous and atomic (temp file, fsync, rename)
 * so a crash mid-write keeps the previous file. Mode 0600.
 */
export class TaskStore {
    file;
    maxTasks;
    byId = new Map();
    constructor(file, maxTasks = 500) {
        this.file = file;
        this.maxTasks = maxTasks;
        mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        try {
            chmodSync(path.dirname(file), 0o700);
        }
        catch {
            // Windows and some mounts reject chmod. The file mode below is the secret boundary.
        }
        this.load();
    }
    load() {
        let raw;
        try {
            raw = readFileSync(this.file, 'utf8');
        }
        catch (error) {
            const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
            if (code === 'ENOENT')
                return;
            throw error;
        }
        if (raw.trim() === '')
            return;
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            throw new Error(`dsh-grok-bridge: task store is not JSON: ${this.file}`);
        }
        if (typeof parsed !== 'object' || parsed === null || parsed.version !== 1) {
            throw new Error(`dsh-grok-bridge: task store version is not 1: ${this.file}`);
        }
        const tasks = parsed.tasks;
        if (!Array.isArray(tasks))
            throw new Error(`dsh-grok-bridge: task store is missing tasks: ${this.file}`);
        for (const entry of tasks) {
            if (!isTask(entry))
                continue;
            this.byId.set(entry.id, entry);
        }
    }
    persist() {
        const body = { version: 1, tasks: [...this.byId.values()] };
        const json = JSON.stringify(body, null, 2);
        const tmp = `${this.file}.${process.pid}.tmp`;
        const fd = openSync(tmp, 'w', 0o600);
        try {
            writeSync(fd, json);
            fsyncSync(fd);
        }
        finally {
            closeSync(fd);
        }
        renameSync(tmp, this.file);
        try {
            chmodSync(this.file, 0o600);
        }
        catch {
            // Best effort. The open() mode already requested 0600.
        }
    }
    get size() {
        return this.byId.size;
    }
    get(id) {
        const found = this.byId.get(id);
        return found ? structuredClone(found) : undefined;
    }
    findBySession(sessionId) {
        for (const task of this.byId.values()) {
            if (task.sessionId === sessionId)
                return structuredClone(task);
        }
        return undefined;
    }
    findByIdempotency(key) {
        for (const task of this.byId.values()) {
            if (task.idempotencyKey === key)
                return structuredClone(task);
        }
        return undefined;
    }
    list() {
        return [...this.byId.values()]
            .map((task) => structuredClone(task))
            .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    }
    upsert(task) {
        const previous = this.byId.get(task.id);
        const next = {
            ...structuredClone(task),
            revision: (previous?.revision ?? 0) + 1,
        };
        this.byId.set(next.id, next);
        this.prune();
        this.persist();
        return structuredClone(next);
    }
    /** Drop the oldest terminal tasks once the file grows past `maxTasks`. Active tasks stay. */
    prune() {
        if (this.byId.size <= this.maxTasks)
            return;
        const terminal = [...this.byId.values()]
            .filter((task) => task.status === 'completed' || task.status === 'failed' || task.status === 'canceled')
            .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1));
        while (this.byId.size > this.maxTasks && terminal.length > 0) {
            const oldest = terminal.shift();
            if (oldest)
                this.byId.delete(oldest.id);
        }
    }
    /** Test hook so prune can be driven without a huge fixture. */
    pruneTo(maxTasks) {
        this.maxTasks = maxTasks;
        this.prune();
        this.persist();
    }
}
export function openTaskStore(file, maxTasks = 500) {
    return new TaskStore(file, maxTasks);
}
//# sourceMappingURL=store.js.map