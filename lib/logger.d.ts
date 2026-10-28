export interface Logger {
    info(message: string): void;
    warn(message: string): void;
}
/** Cordis exposes `ctx.logger` either as an object or as `logger(name)`. */
export declare function pluginLogger(ctx: {
    logger?: unknown;
}): Logger;
//# sourceMappingURL=logger.d.ts.map