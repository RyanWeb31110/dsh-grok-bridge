/** Error that maps to a stable HTTP code. The message is the public code. */
export class BridgeError extends Error {
    status;
    code;
    constructor(status, code) {
        super(code);
        this.name = 'BridgeError';
        this.status = status;
        this.code = code;
    }
}
//# sourceMappingURL=errors.js.map