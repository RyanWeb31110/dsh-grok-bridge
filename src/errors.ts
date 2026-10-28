/** Error that maps to a stable HTTP code. The message is the public code. */
export class BridgeError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(code)
    this.name = 'BridgeError'
    this.status = status
    this.code = code
  }
}
