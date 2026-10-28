/** Error that maps to a stable HTTP code. The message is the public code. */
export declare class BridgeError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string);
}
//# sourceMappingURL=errors.d.ts.map