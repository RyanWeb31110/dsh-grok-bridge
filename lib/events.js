function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
/** Session id carried on a live agent or on a session object wrapped as `{ session }`. */
export function sessionIdOf(agent) {
    if (!isRecord(agent))
        return undefined;
    const session = agent['session'];
    const fromSession = isRecord(session) ? session['id'] : undefined;
    const id = typeof fromSession === 'string' ? fromSession : agent['id'];
    return typeof id === 'string' && id.length > 0 ? id : undefined;
}
function textFromContent(content) {
    if (!Array.isArray(content))
        return undefined;
    const parts = [];
    for (const block of content) {
        if (!isRecord(block))
            continue;
        if (block['type'] === 'text' && typeof block['text'] === 'string')
            parts.push(block['text']);
    }
    const text = parts.join('\n').trim();
    return text.length > 0 ? text : undefined;
}
function errorMessage(error) {
    if (!isRecord(error))
        return undefined;
    return typeof error['message'] === 'string' && error['message'].length > 0
        ? error['message']
        : undefined;
}
/** Pull the facts this bridge cares about out of a `session/event` payload. */
export function readSessionEvent(event) {
    if (!isRecord(event) || typeof event['type'] !== 'string')
        return undefined;
    const data = isRecord(event['data']) ? event['data'] : undefined;
    if (event['type'] === 'assistant/message') {
        const message = data && isRecord(data['message']) ? data['message'] : undefined;
        const text = textFromContent(message?.['content']);
        return text ? { kind: 'assistant', text } : undefined;
    }
    if (event['type'] === 'turn/end') {
        const reason = data && isRecord(data['reason']) ? data['reason'] : undefined;
        const kind = typeof reason?.['kind'] === 'string' ? reason['kind'] : 'completed';
        const observation = { kind: 'turn-end', reason: kind };
        if (kind === 'error')
            observation.error = errorMessage(reason?.['error']) ?? 'agent error';
        return observation;
    }
    return undefined;
}
export function errorText(error) {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'agent error';
    return message.slice(0, 500);
}
//# sourceMappingURL=events.js.map