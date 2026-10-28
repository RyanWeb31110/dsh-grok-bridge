import { errorText, readSessionEvent, sessionIdOf } from './events.js';
function asRecord(value) {
    return typeof value === 'object' && value !== null ? value : undefined;
}
/**
 * Observe harness events for tasks this bridge owns.
 * `approval/request` is a waterfall: always call `next()` so the bridge
 * never grants or swallows a tool approval.
 */
export function attachLifecycle(ctx, service, logger) {
    ctx.on('agent/status', (payload) => {
        const body = asRecord(payload);
        const sessionId = sessionIdOf(body?.['agent']);
        const status = body?.['status'];
        if (!sessionId || typeof status !== 'string')
            return;
        service.onStatus(sessionId, status);
    });
    ctx.on('session/event', (session, event) => {
        const sessionId = sessionIdOf({ session });
        if (!sessionId)
            return;
        const observation = readSessionEvent(event);
        if (!observation)
            return;
        if (observation.kind === 'assistant')
            service.onAssistantText(sessionId, observation.text);
        else
            service.onTurnEnd(sessionId, observation.reason, observation.error);
    });
    ctx.on('agent/error', (payload) => {
        const body = asRecord(payload);
        const sessionId = sessionIdOf(body?.['agent']);
        if (!sessionId)
            return;
        service.onAgentError(sessionId, errorText(body?.['error']));
    });
    ctx.on('approval/request', (req, next) => {
        try {
            const body = asRecord(req);
            const sessionId = sessionIdOf(body?.['agent']);
            const toolName = typeof body?.['toolName'] === 'string' ? body['toolName'] : '';
            if (sessionId && toolName) {
                service.onApproval(sessionId, {
                    toolName,
                    ...(typeof body?.['reason'] === 'string' ? { reason: body['reason'] } : {}),
                    ...(typeof body?.['callId'] === 'string' ? { callId: body['callId'] } : {}),
                });
            }
        }
        catch (error) {
            logger.warn(`approval observe failed: ${error instanceof Error ? error.message : 'unknown'}`);
        }
        if (typeof next !== 'function')
            return undefined;
        return next();
    });
}
//# sourceMappingURL=lifecycle.js.map