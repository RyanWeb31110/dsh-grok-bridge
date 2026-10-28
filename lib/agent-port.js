import { modelRoute } from './config.js';
import { userMessage } from './message.js';
function routeOf(config, launch) {
    if (launch.provider && launch.model)
        return { provider: launch.provider, model: launch.model };
    return modelRoute(config);
}
function textField(value) {
    return typeof value === 'string' ? value.trim() : '';
}
/** Read `ctx.agentDefaultModel.currentSelection()` without assuming a method vs a snapshot. */
export function readProfileDefault(service) {
    if (!service)
        return undefined;
    const current = service.currentSelection;
    const value = typeof current === 'function' ? current.call(service) : current;
    if (typeof value !== 'object' || value === null)
        return undefined;
    const record = value;
    const provider = textField(record['provider']);
    const model = textField(record['model']);
    if (!provider || !model)
        return undefined;
    const reasoningEffort = textField(record['reasoningEffort']);
    return reasoningEffort ? { provider, model, reasoningEffort } : { provider, model };
}
function agentOptions(route) {
    return {
        provider: route.provider,
        model: route.model,
        ...(route.reasoningEffort ? { reasoningEffort: route.reasoningEffort } : {}),
    };
}
/**
 * Live agents created through `ctx.agents`. Messages include `id`, `role`,
 * `content`, and `source` — the same shape as `createUserMessage`.
 */
export function createDshAgentPort(ctx, config, logger) {
    const handles = new Map();
    let announcedDefault = false;
    function remember(sessionId, handle) {
        handles.set(sessionId, handle);
    }
    /**
     * Explicit env overrides win. Otherwise copy the profile default into
     * `agentOptions`. Omitting the route leaves `{{model}}` empty and the
     * persona prefix fails on the first turn.
     */
    function optionsFor(launch) {
        const explicit = routeOf(config, launch);
        const route = explicit ?? readProfileDefault(ctx.agentDefaultModel);
        if (!route) {
            throw new Error('dsh-grok-bridge: no model route. Leave DSH_GROK_PROVIDER and DSH_GROK_MODEL unset to inherit agent-default-model, and make sure that service is mounted.');
        }
        if (!explicit && !announcedDefault) {
            announcedDefault = true;
            const effort = route.reasoningEffort ? ` effort ${route.reasoningEffort}` : '';
            logger.info(`using profile default model ${route.provider}/${route.model}${effort}`);
        }
        return { agentOptions: agentOptions(route) };
    }
    return {
        has(sessionId) {
            return handles.has(sessionId);
        },
        async create(launch) {
            const handle = await ctx.agents.create({
                sessionId: launch.sessionId,
                meta: { cwd: launch.cwd },
                ...optionsFor(launch),
            });
            remember(launch.sessionId, handle);
        },
        async resume(launch) {
            const handle = await ctx.agents.resume({
                resumeSessionId: launch.sessionId,
                ...optionsFor(launch),
            });
            remember(launch.sessionId, handle);
        },
        followup(sessionId, text) {
            const handle = handles.get(sessionId);
            if (!handle)
                throw new Error(`no live agent for session ${sessionId}`);
            handle.agent.followup(userMessage(text));
        },
        steer(sessionId, text) {
            const handle = handles.get(sessionId);
            if (!handle)
                throw new Error(`no live agent for session ${sessionId}`);
            handle.agent.steer(userMessage(text));
        },
        async disposeAll() {
            const pending = [...handles.values()];
            handles.clear();
            await Promise.all(pending.map(async (handle) => {
                try {
                    await handle.dispose?.();
                }
                catch (error) {
                    logger.warn(`agent dispose failed: ${error instanceof Error ? error.message : 'unknown'}`);
                }
            }));
        },
    };
}
//# sourceMappingURL=agent-port.js.map