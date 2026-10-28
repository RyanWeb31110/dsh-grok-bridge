import { modelRoute } from './config.js';
import { userMessage } from './message.js';
function routeOf(config, launch) {
    if (launch.provider && launch.model)
        return { provider: launch.provider, model: launch.model };
    return modelRoute(config);
}
function optionsFor(config, launch) {
    const route = routeOf(config, launch);
    return route ? { agentOptions: route } : {};
}
/**
 * Live agents created through `ctx.agents`. Messages include `id`, `role`,
 * `content`, and `source` — the same shape as `createUserMessage`.
 */
export function createDshAgentPort(ctx, config, logger) {
    const handles = new Map();
    function remember(sessionId, handle) {
        handles.set(sessionId, handle);
    }
    return {
        has(sessionId) {
            return handles.has(sessionId);
        },
        async create(launch) {
            const handle = await ctx.agents.create({
                sessionId: launch.sessionId,
                meta: { cwd: launch.cwd },
                ...optionsFor(config, launch),
            });
            remember(launch.sessionId, handle);
        },
        async resume(launch) {
            const handle = await ctx.agents.resume({
                resumeSessionId: launch.sessionId,
                ...optionsFor(config, launch),
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