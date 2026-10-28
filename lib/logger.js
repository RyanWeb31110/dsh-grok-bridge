/** Cordis exposes `ctx.logger` either as an object or as `logger(name)`. */
export function pluginLogger(ctx) {
    const raw = ctx.logger;
    const named = typeof raw === 'function'
        ? raw('dsh-grok-bridge')
        : raw;
    const target = named && typeof named === 'object'
        ? named
        : undefined;
    return {
        info(message) {
            if (typeof target?.info === 'function')
                target.info(message);
            else
                console.info(`[dsh-grok-bridge] ${message}`);
        },
        warn(message) {
            if (typeof target?.warn === 'function')
                target.warn(message);
            else
                console.warn(`[dsh-grok-bridge] ${message}`);
        },
    };
}
//# sourceMappingURL=logger.js.map