export interface AssistantText {
    kind: 'assistant';
    text: string;
}
export interface TurnEnd {
    kind: 'turn-end';
    reason: string;
    error?: string;
}
export type SessionObservation = AssistantText | TurnEnd;
/** Session id carried on a live agent or on a session object wrapped as `{ session }`. */
export declare function sessionIdOf(agent: unknown): string | undefined;
/** Pull the facts this bridge cares about out of a `session/event` payload. */
export declare function readSessionEvent(event: unknown): SessionObservation | undefined;
export declare function errorText(error: unknown): string;
//# sourceMappingURL=events.d.ts.map