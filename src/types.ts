export const TASK_STATUSES = [
  'queued',
  'running',
  'needs_approval',
  'completed',
  'failed',
  'canceled',
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TERMINAL_STATUSES: readonly TaskStatus[] = ['completed', 'failed', 'canceled']

export function isTerminal(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'canceled'
}

export interface ApprovalInfo {
  toolName: string
  reason?: string
  callId?: string
  requestedAt: string
}

/** Durable task row. `sessionReady` is internal and is not part of the HTTP body. */
export interface TaskRecord {
  id: string
  sessionId: string
  status: TaskStatus
  title: string
  prompt: string
  cwd: string
  createdAt: string
  updatedAt: string
  revision: number
  sessionReady: boolean
  steerCount: number
  resultText?: string
  resultTruncated?: boolean
  error?: string
  endReason?: string
  approval?: ApprovalInfo
  metadata?: Record<string, unknown>
  idempotencyKey?: string
}

export interface PublicTask {
  id: string
  sessionId: string
  status: TaskStatus
  title: string
  prompt: string
  cwd: string
  createdAt: string
  updatedAt: string
  revision: number
  steerCount: number
  resultText?: string
  resultTruncated?: boolean
  error?: string
  endReason?: string
  approval?: ApprovalInfo
  metadata?: Record<string, unknown>
}

export function toPublicTask(task: TaskRecord): PublicTask {
  const pub: PublicTask = {
    id: task.id,
    sessionId: task.sessionId,
    status: task.status,
    title: task.title,
    prompt: task.prompt,
    cwd: task.cwd,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    revision: task.revision,
    steerCount: task.steerCount,
  }
  if (task.resultText !== undefined) pub.resultText = task.resultText
  if (task.resultTruncated) pub.resultTruncated = true
  if (task.error !== undefined) pub.error = task.error
  if (task.endReason !== undefined) pub.endReason = task.endReason
  if (task.approval !== undefined) pub.approval = task.approval
  if (task.metadata !== undefined) pub.metadata = task.metadata
  return pub
}

export type OutboundEventType =
  | 'task.completed'
  | 'task.failed'
  | 'task.needs_approval'
  | 'heartbeat'

export interface OutboundEnvelope {
  type: OutboundEventType
  id: string
  ts: string
  bridge: 'dsh-grok-bridge'
  version: string
  task?: PublicTask
  uptimeSec?: number
  tasks?: { total: number; running: number; needsApproval: number }
}
