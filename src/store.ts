import { chmodSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs'
import path from 'node:path'
import type { TaskRecord } from './types.js'

interface StoreFile {
  version: 1
  tasks: TaskRecord[]
}

function isTask(value: unknown): value is TaskRecord {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Partial<TaskRecord>
  return typeof row.id === 'string' && typeof row.sessionId === 'string' && typeof row.status === 'string'
}

/**
 * JSON task map. Writes are synchronous and atomic (temp file, fsync, rename)
 * so a crash mid-write keeps the previous file. Mode 0600.
 */
export class TaskStore {
  private readonly byId = new Map<string, TaskRecord>()

  constructor(readonly file: string, private maxTasks = 500) {
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    try {
      chmodSync(path.dirname(file), 0o700)
    } catch {
      // Windows and some mounts reject chmod. The file mode below is the secret boundary.
    }
    this.load()
  }

  private load(): void {
    let raw: string
    try {
      raw = readFileSync(this.file, 'utf8')
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
      if (code === 'ENOENT') return
      throw error
    }
    if (raw.trim() === '') return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      throw new Error(`dsh-grok-bridge: task store is not JSON: ${this.file}`)
    }
    if (typeof parsed !== 'object' || parsed === null || (parsed as StoreFile).version !== 1) {
      throw new Error(`dsh-grok-bridge: task store version is not 1: ${this.file}`)
    }
    const tasks = (parsed as StoreFile).tasks
    if (!Array.isArray(tasks)) throw new Error(`dsh-grok-bridge: task store is missing tasks: ${this.file}`)
    for (const entry of tasks) {
      if (!isTask(entry)) continue
      this.byId.set(entry.id, entry)
    }
  }

  private persist(): void {
    const body: StoreFile = { version: 1, tasks: [...this.byId.values()] }
    const json = JSON.stringify(body, null, 2)
    const tmp = `${this.file}.${process.pid}.tmp`
    const fd = openSync(tmp, 'w', 0o600)
    try {
      writeSync(fd, json)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, this.file)
    try {
      chmodSync(this.file, 0o600)
    } catch {
      // Best effort. The open() mode already requested 0600.
    }
  }

  get size(): number {
    return this.byId.size
  }

  get(id: string): TaskRecord | undefined {
    const found = this.byId.get(id)
    return found ? structuredClone(found) : undefined
  }

  findBySession(sessionId: string): TaskRecord | undefined {
    for (const task of this.byId.values()) {
      if (task.sessionId === sessionId) return structuredClone(task)
    }
    return undefined
  }

  findByIdempotency(key: string): TaskRecord | undefined {
    for (const task of this.byId.values()) {
      if (task.idempotencyKey === key) return structuredClone(task)
    }
    return undefined
  }

  list(): TaskRecord[] {
    return [...this.byId.values()]
      .map((task) => structuredClone(task))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
  }

  upsert(task: TaskRecord): TaskRecord {
    const previous = this.byId.get(task.id)
    const next: TaskRecord = {
      ...structuredClone(task),
      revision: (previous?.revision ?? 0) + 1,
    }
    this.byId.set(next.id, next)
    this.prune()
    this.persist()
    return structuredClone(next)
  }

  /** Drop the oldest terminal tasks once the file grows past `maxTasks`. Active tasks stay. */
  private prune(): void {
    if (this.byId.size <= this.maxTasks) return
    const terminal = [...this.byId.values()]
      .filter((task) => task.status === 'completed' || task.status === 'failed' || task.status === 'canceled')
      .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1))
    while (this.byId.size > this.maxTasks && terminal.length > 0) {
      const oldest = terminal.shift()
      if (oldest) this.byId.delete(oldest.id)
    }
  }

  /** Test hook so prune can be driven without a huge fixture. */
  pruneTo(maxTasks: number): void {
    this.maxTasks = maxTasks
    this.prune()
    this.persist()
  }
}

export function openTaskStore(file: string, maxTasks = 500): TaskStore {
  return new TaskStore(file, maxTasks)
}
