/**
 * Compare two strings without leaking the expected value through an early length check.
 * Digests are fixed length, so `timingSafeEqual` always runs.
 */
export declare function secretsMatch(provided: string, expected: string): boolean;
/** Pull the token out of `Authorization: Bearer <token>`. */
export declare function bearerToken(header: string | undefined): string | undefined;
export declare function authorized(header: string | undefined, expectedToken: string): boolean;
/** HMAC-SHA256 over `timestamp + "." + rawBody`, hex-encoded. */
export declare function signBody(secret: string, timestamp: string, body: string): string;
export declare function verifySignature(secret: string, timestamp: string, body: string, header: string | undefined): boolean;
/** Accept unix seconds (or milliseconds) within `skewSec` of now. */
export declare function timestampFresh(timestamp: string, nowSec?: number, skewSec?: number): boolean;
//# sourceMappingURL=auth.d.ts.map