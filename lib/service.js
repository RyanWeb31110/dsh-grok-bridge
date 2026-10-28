import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { cwdAllowed, modelRoute } from './config.js';
import { BridgeError } from './errors.js';
import { clipTask, eventId, postEvent } from './outbound.js';
import { isTerminal, toPublicTask, } from './types.js';
import { VERSION } from './version.js';
const MAX_PROMPT = 100_000;
const MAX_STORED_TEXT = 200_000;
const MAX_METADATA = 8_192;
const TASK_ID = /^task_[0-9a-f]{32}$/;
const IDEMPOTENCY = /^[A-Za-z0-9._:-]{1,128}$/;
function titleFrom(prompt, requested) {
    if (typeof requested === 'string' && requested.trim())
        return requested.trim().slice(0, 120);
    const line = prompt.replace(/\s+/g, ' ').trim();
    return line.slice(0, 80) || 'task';
}
function metadataOf(value) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new BridgeError(400, 'invalid_metadata');
    }
    const encoded = JSON.stringify(value);
    if (encoded.length > MAX_METADATA)
        throw new BridgeError(400, 'metadata_too_large');
    return JSON.parse(encoded);
}
function requirePrompt(value) {
    if (typeof value !== 'string' || value.trim() === '')
        throw new BridgeError(400, 'empty_prompt');
    const prompt = value.trim();
    if (prompt.length > MAX_PROMPT)
        throw new BridgeError(400, 'prompt_too_large');
    return prompt;
}
export function assertIdempotencyKey(key) {
    if (key === undefined || key === '')
        return undefined;
    if (!IDEMPOTENCY.test(key))
        throw new BridgeError(400, 'invalid_idempotency_key');
    return key;
}
export function isTaskId(id) {
    return TASK_ID.test(id);
}
function launchFor(config, sessionId, cwd) {
    const route = modelRoute(config);
    return {
        sessionId,
        cwd,
        ...(route ? { provider: route.provider, model: route.model } : {}),
    };
}
export function createTaskService(options) {
    const { config, store, driver, logger } = options;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const now = options.now ?? (() => new Date());
    const lastError = new Map();
    const startedAt = Date.now();
    let suppressInterrupt = 0;
    function stamp() {
        return now().toISOString();
    }
    function emit(type, task) {
        const envelope = {
            type,
            id: eventId(),
            ts: stamp(),
            bridge: 'dsh-grok-bridge',
            version: VERSION,
            task: clipTask(toPublicTask(task)),
        };
        void postEvent(config, envelope, logger, fetchImpl);
    }
    function latest(id) {
        return store.get(id);
    }
    function save(task, patch) {
        const current = latest(task.id) ?? task;
        return store.upsert({ ...current, ...patch, updatedAt: stamp() });
    }
    function finish(task, status, patch, type) {
        const current = latest(task.id) ?? task;
        if (isTerminal(current.status))
            return;
        const saved = save(current, { ...patch, status });
        emit(type, saved);
        logger.info(`task ${saved.id} ${status}`);
    }
    function resolveCwd(requested) {
        const cwd = typeof requested === 'string' && requested.trim()
            ? path.resolve(requested.trim())
            : config.cwd;
        if (!cwdAllowed(cwd, config.cwdAllowlist))
            throw new BridgeError(403, 'cwd_not_allowed');
        return cwd;
    }
    async function ensureLive(task, text, kind) {
        const launch = launchFor(config, task.sessionId, task.cwd);
        if (!driver.has(task.sessionId)) {
            // Resume of an orphaned turn emits `interrupted`. A steer is about to
            // continue that session, so that closer must not fail the task.
            suppressInterrupt += 1;
            try {
                if (task.sessionReady)
                    await driver.resume(launch);
                else
                    await driver.create(launch);
            }
            finally {
                suppressInterrupt -= 1;
            }
        }
        if (kind === 'steer')
            driver.steer(task.sessionId, text);
        else
            driver.followup(task.sessionId, text);
    }
    return {
        async createTask(input, idempotencyKey) {
            const key = assertIdempotencyKey(idempotencyKey);
            if (key) {
                const existing = store.findByIdempotency(key);
                if (existing)
                    return { task: toPublicTask(existing), created: false };
            }
            const prompt = requirePrompt(input.prompt);
            const cwd = resolveCwd(input.cwd);
            const metadata = metadataOf(input.metadata);
            const createdAt = stamp();
            const task = {
                id: `task_${randomUUID().replaceAll('-', '')}`,
                sessionId: randomUUID(),
                status: 'queued',
                title: titleFrom(prompt, input.title),
                prompt,
                cwd,
                createdAt,
                updatedAt: createdAt,
                revision: 0,
                sessionReady: false,
                steerCount: 0,
                ...(metadata ? { metadata } : {}),
                ...(key ? { idempotencyKey: key } : {}),
            };
            store.upsert(task);
            try {
                await driver.create(launchFor(config, task.sessionId, task.cwd));
                driver.followup(task.sessionId, prompt);
                const saved = save(task, { sessionReady: true });
                logger.info(`task ${saved.id} queued on session ${saved.sessionId}`);
                return { task: toPublicTask(saved), created: true };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'agent failed';
                const failed = save(task, {
                    sessionReady: driver.has(task.sessionId),
                    status: 'failed',
                    error: message.slice(0, 500),
                    endReason: 'error',
                });
                emit('task.failed', failed);
                logger.warn(`task ${failed.id} failed to start: ${failed.error ?? message}`);
                throw new BridgeError(502, 'agent_failed');
            }
        },
        listTasks(limit) {
            return store.list().slice(0, limit).map(toPublicTask);
        },
        getTask(id) {
            const task = store.get(id);
            return task ? toPublicTask(task) : undefined;
        },
        async steer(id, text) {
            const prompt = requirePrompt(text);
            const task = store.get(id);
            if (!task)
                throw new BridgeError(404, 'not_found');
            try {
                const kind = task.sessionReady ? 'steer' : 'followup';
                await ensureLive(task, prompt, kind);
                const patch = {
                    sessionReady: true,
                    steerCount: task.steerCount + 1,
                };
                if (isTerminal(task.status))
                    patch.status = 'queued';
                const saved = save(task, patch);
                logger.info(`task ${saved.id} steered`);
                return toPublicTask(saved);
            }
            catch (error) {
                if (error instanceof BridgeError)
                    throw error;
                const message = error instanceof Error ? error.message : 'agent failed';
                logger.warn(`task ${task.id} steer failed: ${message}`);
                throw new BridgeError(502, 'agent_failed');
            }
        },
        onStatus(sessionId, status) {
            const task = store.findBySession(sessionId);
            if (!task || isTerminal(task.status))
                return;
            if (status === 'running') {
                save(task, { status: 'running' });
                return;
            }
            if (status === 'idle') {
                const message = lastError.get(sessionId);
                if (message && (task.status === 'running' || task.status === 'needs_approval')) {
                    lastError.delete(sessionId);
                    finish(task, 'failed', { error: message, endReason: 'error' }, 'task.failed');
                }
            }
        },
        onAssistantText(sessionId, text) {
            const task = store.findBySession(sessionId);
            if (!task || isTerminal(task.status))
                return;
            const clipped = text.length > MAX_STORED_TEXT;
            save(task, {
                resultText: clipped ? text.slice(0, MAX_STORED_TEXT) : text,
                ...(clipped ? { resultTruncated: true } : {}),
            });
        },
        onTurnEnd(sessionId, reason, error) {
            const task = store.findBySession(sessionId);
            if (!task || isTerminal(task.status))
                return;
            lastError.delete(sessionId);
            if (reason === 'completed' || reason === 'max-tokens') {
                finish(task, 'completed', { endReason: reason }, 'task.completed');
                return;
            }
            if (reason === 'interrupted' && suppressInterrupt > 0)
                return;
            if (reason === 'aborted') {
                finish(task, 'canceled', { endReason: reason, error: 'canceled' }, 'task.failed');
                return;
            }
            if (reason === 'blocked' && task.status === 'needs_approval')
                return;
            const message = error
                ?? (reason === 'interrupted' ? 'session interrupted' : reason);
            finish(task, 'failed', { error: message.slice(0, 500), endReason: reason }, 'task.failed');
        },
        onApproval(sessionId, approval) {
            const task = store.findBySession(sessionId);
            if (!task || isTerminal(task.status))
                return;
            if (task.status === 'needs_approval'
                && task.approval?.toolName === approval.toolName
                && task.approval.reason === approval.reason
                && task.approval.callId === approval.callId) {
                return;
            }
            const info = {
                toolName: approval.toolName,
                requestedAt: stamp(),
                ...(approval.reason ? { reason: approval.reason } : {}),
                ...(approval.callId ? { callId: approval.callId } : {}),
            };
            const saved = save(task, { status: 'needs_approval', approval: info });
            emit('task.needs_approval', saved);
            logger.info(`task ${saved.id} needs approval for ${info.toolName}`);
        },
        onAgentError(sessionId, message) {
            lastError.set(sessionId, message.slice(0, 500));
        },
        async resumeActive() {
            for (const task of store.list()) {
                if (isTerminal(task.status))
                    continue;
                if (!task.sessionReady) {
                    finish(task, 'failed', {
                        error: 'session was not started before shutdown',
                        endReason: 'interrupted',
                    }, 'task.failed');
                    continue;
                }
                try {
                    await driver.resume(launchFor(config, task.sessionId, task.cwd));
                    logger.info(`resumed session ${task.sessionId} for task ${task.id}`);
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : 'resume failed';
                    finish(task, 'failed', {
                        error: `resume failed: ${message}`.slice(0, 500),
                        endReason: 'interrupted',
                    }, 'task.failed');
                }
            }
        },
        async shutdown() {
            await driver.disposeAll();
        },
        counts() {
            const tasks = store.list();
            return {
                total: tasks.length,
                running: tasks.filter((task) => task.status === 'running' || task.status === 'queued').length,
                needsApproval: tasks.filter((task) => task.status === 'needs_approval').length,
            };
        },
        heartbeatEvent() {
            const tasks = store.list();
            return {
                type: 'heartbeat',
                id: eventId(),
                ts: stamp(),
                bridge: 'dsh-grok-bridge',
                version: VERSION,
                uptimeSec: Math.max(0, Math.round((now().getTime() - startedAt) / 1000)),
                tasks: {
                    total: tasks.length,
                    running: tasks.filter((task) => task.status === 'running' || task.status === 'queued').length,
                    needsApproval: tasks.filter((task) => task.status === 'needs_approval').length,
                },
            };
        },
    };
}
//# sourceMappingURL=service.js.map