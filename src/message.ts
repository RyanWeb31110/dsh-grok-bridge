import { randomUUID } from 'node:crypto'

/**
 * User message shaped like `@deepseek-ai/dsh-llm` `createUserMessage`.
 *
 * The harness types this at compile time and does not validate it at the
 * inbox. A message missing `role` is persisted and then rejected by the model
 * provider on every later turn. Build the four fields here so the plugin does
 * not take its own copy of `dsh-llm` (the host must own that module).
 */
export interface UserTextMessage {
  readonly id: string
  readonly role: 'user'
  readonly content: readonly [{ readonly type: 'text'; readonly text: string }]
  readonly source: { readonly kind: 'user' }
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

export function userMessage(text: string): UserTextMessage {
  return freeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })
}
