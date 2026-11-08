/**
 * Durable plugin-owned state. A small JSON sidecar plus an append-only audit
 * log; both live outside the session log so titles stay reconstructable and the
 * model never sees this file.
 *
 * Writes are coalesced and atomic (temp file + rename). A lost or unreadable
 * file degrades to "no memory", which is safe: the plugin then never touches a
 * session whose title was renamed by hand.
 */

import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const STATE_VERSION = 1
const MAX_RECORDS = 400

export class TitleState {
  /** @param {string} dir - plugin data directory. */
  constructor(dir) {
    this.dir = dir
    this.path = join(dir, 'state.json')
    this.auditPath = join(dir, 'audit.jsonl')
    this.records = {}
    this.loaded = false
    this.pending = Promise.resolve()
    this.dirty = false
    this.auditQueue = Promise.resolve()
  }

  async load() {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8'))
      if (raw && raw.version === STATE_VERSION && raw.records && typeof raw.records === 'object') {
        this.records = raw.records
      }
    } catch {
      // Missing or corrupt state is not fatal; the plugin starts with no memory.
      this.records = {}
    }
  }

  /** Read one session record without creating it. */
  get(sessionId) {
    return this.records[sessionId]
  }

  /** Read, creating an empty record when absent. */
  touch(sessionId) {
    let record = this.records[sessionId]
    if (!record) {
      record = { createdAt: Date.now() }
      this.records[sessionId] = record
    }
    return record
  }

  /** Mutate one session record and persist. */
  async update(sessionId, patch) {
    const record = this.touch(sessionId)
    Object.assign(record, patch, { updatedAt: Date.now() })
    this.trim()
    this.dirty = true
    await this.flush()
    return record
  }

  /** Drop the oldest records so the sidecar cannot grow without bound. */
  trim() {
    const entries = Object.entries(this.records)
    if (entries.length <= MAX_RECORDS) return
    entries
      .sort((a, b) => (a[1].updatedAt || a[1].createdAt || 0) - (b[1].updatedAt || b[1].createdAt || 0))
      .slice(0, entries.length - MAX_RECORDS)
      .forEach(([id]) => delete this.records[id])
  }

  /** Coalesced atomic flush: concurrent callers join the latest write. */
  flush() {
    if (!this.dirty) return this.pending
    this.dirty = false
    this.pending = this.pending.then(async () => {
      try {
        await mkdir(this.dir, { recursive: true })
        const tmp = `${this.path}.${process.pid}.tmp`
        await writeFile(tmp, JSON.stringify({ version: STATE_VERSION, records: this.records }, null, 2), 'utf8')
        await rename(tmp, this.path)
      } catch {
        // Never let a state-write failure break title updates; memory still holds it.
        this.dirty = true
      }
    })
    return this.pending
  }

  /** Append one audit line; failures are ignored on purpose. */
  audit(entry) {
    this.auditQueue = this.auditQueue.then(async () => {
      try {
        await mkdir(dirname(this.auditPath), { recursive: true })
        const handle = await open(this.auditPath, 'a')
        try {
          await handle.write(JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n')
        } finally {
          await handle.close()
        }
      } catch {
        /* audit is best-effort */
      }
    })
    return this.auditQueue
  }
}

/** Remove a stale temp file left by an interrupted write. */
export async function cleanupTemp(dir) {
  try {
    await unlink(join(dir, `state.json.${process.pid}.tmp`))
  } catch {
    /* nothing to clean */
  }
}
