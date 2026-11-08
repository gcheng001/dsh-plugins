/**
 * Session-title curator module (host side): watches every live session, and
 * after a turn settles asks the session's own model route for a
 * "category emoji + object｜goal" title, then writes it through
 * `sessionTitle.rename()`.
 *
 * Based on chancecc99-gif/dsh-title-curator (MIT, v0.1.2 + this user's local
 * patches, folded in): policy 5 core, first-write-unlocked semantics and
 * legacy false-lock release. Merged into dsh-claude-lite (轻妆) as an
 * independent module; category emojis are runtime-configurable (core.js).
 *
 * Design contract:
 * - Only metadata changes. No message, prompt or tool is added to the session.
 * - The session log stays the source of truth; a small sidecar keeps
 *   "which title did I write last" plus locks, fingerprints and audit.
 * - Any manual rename after our own write wins forever: the session locks.
 * - Failure is silent and keeps the current title.
 */

import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  POLICY_VERSION,
  buildContext,
  cleanText,
  createAssembler,
  decide,
  fingerprint,
  getCategoryVersion,
  isConfirmationOnly,
  parseModelResult,
  systemPrompt,
  validateTitle,
} from './core.js'
import { TitleState } from './state.js'

export const name = 'dsh-claude-lite'

/** Lock reason produced by the pre-1.0.3 rule that could not tell a model title from a human one. */
const LEGACY_LOCK_REASON = '检测到手动标题'
export const inject = ['sessionTitle', 'sessions', 'llm']

const DEFAULTS = {
  enabled: true,
  /** Wait this long after the last user message before evaluating. */
  debounceMs: 6000,
  /** Never evaluate the same session more often than this. */
  minIntervalMs: 90_000,
  /** Concurrent naming calls across all sessions. */
  maxConcurrent: 1,
  /** Wait this long after activation before backfilling already-open sessions. */
  sweepDelayMs: 4000,
  /** Wait this long after the first request header of an unseen session. */
  headerDelayMs: 1500,
  timeoutMs: 45_000,
  /** Reasoning models spend output tokens before the JSON; keep a real margin. */
  maxTokens: 700,
  recentMessages: 5,
  messageChars: 600,
  maxInputChars: 6000,
}

function resolveConfig(config) {
  const value = config && typeof config === 'object' ? config : {}
  const merged = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS)) {
    if (value[key] === undefined) continue
    if (key === 'enabled') {
      if (typeof value.enabled !== 'boolean') throw new Error('dsh-claude-lite: titleCurator.enabled must be a boolean')
      merged.enabled = value.enabled
      continue
    }
    const number = Number(value[key])
    if (!Number.isFinite(number) || number < 0) throw new Error(`dsh-claude-lite: titleCurator.${key} must be a non-negative number`)
    merged[key] = number
  }
  merged.recentMessages = Math.min(8, Math.max(1, Math.floor(merged.recentMessages)))
  merged.maxConcurrent = Math.min(4, Math.max(1, Math.floor(merged.maxConcurrent)))
  return merged
}

/** Plugin data directory (state sidecar, audit log, category-emoji config). */
export function titleDataDir() {
  // Legacy env override kept working for existing setups.
  if (process.env.DSH_TITLE_CURATOR_DATA) return process.env.DSH_TITLE_CURATOR_DATA
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'plugin-data', 'dsh-claude-lite')
}

/** Minimal counting semaphore: naming calls are few and cheap, but not free. */
function createLimiter(limit) {
  let active = 0
  const waiting = []
  const release = () => {
    active -= 1
    const next = waiting.shift()
    if (next) next()
  }
  return async function run(task) {
    if (active >= limit) await new Promise((resolve) => waiting.push(resolve))
    active += 1
    try {
      return await task()
    } finally {
      release()
    }
  }
}

/** Human-authored text blocks of one user message, or '' when there are none. */
function messageText(event) {
  const blocks = Array.isArray(event?.data?.content) ? event.data.content : []
  const text = blocks
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
  return cleanText(text)
}

/** Recent human messages, oldest first, each bounded. */
function recentMessages(session, config) {
  const collected = []
  for (const event of session.snapshotEvents()) {
    if (event.type !== 'user/message') continue
    if (event.data?.source?.kind !== 'user') continue
    const text = messageText(event)
    if (!text) continue
    collected.push({ seq: event.seq, text: text.slice(0, config.messageChars) })
  }
  const selected = collected.slice(-config.recentMessages)
  // Trim from the oldest end until the whole payload fits the input budget.
  let total = selected.reduce((sum, item) => sum + item.text.length, 0)
  while (selected.length > 1 && total > config.maxInputChars) {
    total -= selected[0].text.length
    selected.shift()
  }
  return selected
}

/** Titles already visible in other live sessions, for de-duplication. */
function otherTitles(ctx, session) {
  const titles = []
  let list = []
  try {
    list = ctx.sessions.list()
  } catch {
    return titles
  }
  for (const other of list) {
    if (!other || other.id === session.id) continue
    try {
      const snapshot = ctx.sessionTitle.get(other)
      if (typeof snapshot?.title === 'string' && snapshot.title) titles.push(snapshot.title)
    } catch {
      /* ignore one broken session */
    }
    if (titles.length >= 16) break
  }
  return titles
}

export function apply(ctx, config) {
  const cfg = resolveConfig(config)
  if (!cfg.enabled) return

  const state = new TitleState(titleDataDir())
  const limit = createLimiter(cfg.maxConcurrent)
  const timers = new Map()
  const pending = new Set()
  const inFlight = new Set()
  const controllers = new Map()
  const routeRetried = new Set()
  let stopped = false
  let loading = null

  const ready = () => {
    if (!loading) loading = state.load().then(releaseLegacyLocks)
    return loading
  }

  /**
   * Earlier versions locked every session whose title came from the built-in
   * provider, because that provider writes `source: {kind:'user'}` too. Those
   * locks were not human decisions: drop them once, then this path never recurs.
   */
  async function releaseLegacyLocks() {
    let released = 0
    for (const [id, record] of Object.entries(state.records)) {
      if (!record?.locked || record.lockReason !== LEGACY_LOCK_REASON) continue
      delete record.locked
      delete record.lockReason
      released += 1
      await state.audit({ session: id, status: 'unlocked', reason: 'legacy false lock released' })
    }
    if (released > 0) {
      state.dirty = true
      await state.flush()
      log('info', `released ${released} legacy false lock(s)`)
    }
  }

  function log(level, message, extra) {
    try {
      ctx.logger?.[level]?.(`dsh-claude-lite: ${message}`, extra)
    } catch {
      /* logging must never break naming */
    }
  }

  function cancel(sessionId) {
    const timer = timers.get(sessionId)
    if (timer !== undefined) clearTimeout(timer)
    timers.delete(sessionId)
    pending.delete(sessionId)
    controllers.get(sessionId)?.abort(new Error('dsh-claude-lite cancelled'))
    controllers.delete(sessionId)
  }

  function schedule(session, delay) {
    if (stopped) return
    const existing = timers.get(session.id)
    if (existing !== undefined) clearTimeout(existing)
    const timer = setTimeout(() => {
      timers.delete(session.id)
      void evaluate(session).catch((error) => log('debug', 'evaluation failed', { error: String(error?.message || error) }))
    }, delay)
    timer.unref?.()
    timers.set(session.id, timer)
  }

  async function generate(session, route, input, signal, maxTokens) {
    const message = {
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text: JSON.stringify(input) }],
      source: { kind: 'plugin', plugin: name },
    }
    const request = { provider: route.provider, model: route.model, maxTokens }
    // Prefer the cheapest supported reasoning effort: a title must not burn its
    // whole output budget on reasoning before emitting the two JSON lines.
    let dispatch = null
    if (typeof ctx.llm.prepareCall === 'function') {
      try {
        const prepared = await ctx.llm.prepareCall(request, signal, (controls, model) => {
          const effort = model?.reasoning?.efforts?.[0]?.id
          return effort === undefined ? controls : { ...controls, reasoningEffort: effort }
        })
        dispatch = (options) => prepared.stream({ ...prepared.config, ...options })
      } catch (error) {
        log('debug', 'prepareCall unavailable, falling back to stream', { error: String(error?.message || error) })
      }
    }
    if (!dispatch) dispatch = (options) => ctx.llm.stream({ ...request, ...options })

    const assembler = createAssembler()
    const stream = dispatch({
      messages: [message],
      system: systemPrompt(),
      purpose: 'session-title',
      sessionId: session.id,
      signal,
    })
    for await (const chunk of stream) {
      signal?.throwIfAborted()
      assembler.push(chunk)
    }
    return assembler.result()
  }

  async function evaluate(session, options = {}) {
    const sweep = options.sweep === true
    if (stopped || !cfg.enabled) return
    if (!session || ctx.sessions.get(session.id) !== session) return
    if (inFlight.has(session.id)) return
    inFlight.add(session.id)
    const controller = new AbortController()
    controllers.set(session.id, controller)
    // Category set identity at entry: a mid-evaluation swap (settings POST)
    // invalidates the prompt this round was built on — drop, retry next event.
    const catVer = getCategoryVersion()
    try {
      await ready()
      const record = state.get(session.id)
      if (record?.locked) return

      const before = ctx.sessionTitle.get(session)
      // `source.kind === 'user'` cannot identify a human rename: the host's built-in
      // title provider writes the same marker from a model call. So before this plugin
      // has written a title the session has no history with us — adopt a compliant
      // title, otherwise fall through and rename it. Only a change AFTER our own write
      // (the eventSeq drift below) counts as somebody else's decision.
      if (record?.lastSeq !== undefined && before && before.eventSeq !== record.lastSeq) {
        await state.update(session.id, { locked: true, lockReason: '检测到外部改名', lastTitle: before.title })
        await state.audit({ session: session.id, status: 'locked', reason: 'title changed outside the plugin' })
        return
      }

      const messages = recentMessages(session, cfg)
      if (messages.length === 0) return

      // Pure acknowledgements carry no new naming evidence.
      const fresh = record?.lastMessageSeq === undefined
        ? messages
        : messages.filter((item) => item.seq > record.lastMessageSeq)
      if (fresh.length > 0 && isConfirmationOnly(fresh.map((item) => item.text))) {
        await state.update(session.id, { lastMessageSeq: messages.at(-1).seq })
        await state.audit({ session: session.id, status: 'skip', reason: 'confirmation only' })
        return
      }

      const currentTitle = before?.title || ''
      const print = fingerprint({ cwd: session.header?.cwd, title: currentTitle, messages })
      // Same opportunity as last time is a no-op — but only when the title we
      // stopped on actually satisfies the format. A legacy plain title always
      // gets another chance.
      if (record?.fingerprint === print && validateTitle(currentTitle).ok) {
        await state.update(session.id, { lastMessageSeq: messages.at(-1).seq })
        return
      }

      const lastAttempt = record?.lastAttemptAt || 0
      if (!sweep && lastAttempt && Date.now() - lastAttempt < cfg.minIntervalMs && record?.fingerprint) {
        await state.update(session.id, { lastMessageSeq: messages.at(-1).seq, throttledAt: Date.now() })
        return
      }

      const routeConfig = session.requestHeader?.()?.config
      if (!routeConfig?.provider || !routeConfig?.model) {
        // A freshly opened historical session may not have a header yet; try
        // once more shortly, then give up until the next event arrives.
        if (!routeRetried.has(session.id)) {
          routeRetried.add(session.id)
          schedule(session, cfg.headerDelayMs + 2500)
        }
        log('debug', 'no model route yet')
        return
      }

      const others = otherTitles(ctx, session)
      const input = buildContext({ title: currentTitle, cwd: session.header?.cwd, others, messages })
      const started = Date.now()
      const timeout = setTimeout(() => controller.abort(new Error('dsh-claude-lite timeout')), cfg.timeoutMs)
      timeout.unref?.()

      let raw
      let budget = cfg.maxTokens
      try {
        // A reasoning model can spend the whole output budget before emitting
        // JSON: retry with a larger budget while the deadline still allows it.
        for (let attempt = 0; ; attempt += 1) {
          raw = await limit(() => generate(session, routeConfig, input, controller.signal, budget))
          const truncated = raw.finish?.kind === 'max-tokens' && !parseModelResult(raw.text)
          if (!truncated || attempt >= 2 || budget >= 2400) break
          budget = Math.min(budget * 2, 2400)
        }
      } catch (error) {
        await state.update(session.id, { lastAttemptAt: Date.now(), lastMessageSeq: messages.at(-1).seq })
        await state.audit({ session: session.id, status: 'model-failed', error: String(error?.message || error), ms: Date.now() - started })
        return
      } finally {
        clearTimeout(timeout)
      }

      if (raw.finish?.kind === 'error' || raw.finish?.kind === 'aborted') {
        await state.update(session.id, { lastAttemptAt: Date.now(), lastMessageSeq: messages.at(-1).seq })
        await state.audit({ session: session.id, status: 'model-failed', error: `finish ${raw.finish.kind}`, ms: Date.now() - started })
        return
      }

      const parsed = parseModelResult(raw.text)
      if (!parsed) {
        await state.update(session.id, { lastAttemptAt: Date.now(), lastMessageSeq: messages.at(-1).seq })
        await state.audit({
          session: session.id,
          status: raw.finish?.kind === 'max-tokens' ? 'truncated' : 'invalid-json',
          budget,
          raw: raw.text.slice(0, 200),
        })
        return
      }

      let decision = decide({ currentTitle, candidate: parsed, conflicts: others })
      // `keep` is only acceptable when the current title already satisfies the
      // format. Models routinely praise a plain sentence as "compliant", so a
      // keep against a non-compliant title gets one explicit retry.
      if (decision.action === 'keep' && !validateTitle(currentTitle).ok) {
        const structured = {
          ...input,
          naming_feedback: `当前标题「${currentTitle || '(空)'}」不符合「类别 emoji + 对象｜目标」结构。` +
            '请基于对话给出合规标题并返回 rename；只有确实没有任何对象或目标证据时才 keep。',
        }
        try {
          const again = await limit(() => generate(session, routeConfig, structured, controller.signal, cfg.maxTokens))
          const second = parseModelResult(again.text)
          if (second) decision = decide({ currentTitle, candidate: second, conflicts: others })
        } catch {
          /* fall through: keep the original decision */
        }
        if (decision.action === 'keep') {
          // Do not record a fingerprint: the next turn tries again with new evidence.
          await state.update(session.id, { lastAttemptAt: Date.now(), lastMessageSeq: messages.at(-1).seq })
          await state.audit({ session: session.id, status: 'kept-noncompliant', title: currentTitle })
          return
        }
      }
      if (decision.action === 'conflict') {
        const retry = buildContext({
          title: currentTitle,
          cwd: session.header?.cwd,
          others,
          messages,
        })
        retry.naming_feedback = '候选标题与其它会话重名。用对话中真实的模块、对象或主题区分；无法区分就 keep，不要编造编号。'
        try {
          const again = await limit(() => generate(session, routeConfig, retry, controller.signal, cfg.maxTokens))
          const second = parseModelResult(again.text)
          if (second) decision = decide({ currentTitle, candidate: second, conflicts: others })
        } catch {
          /* keep the original (conflicting) decision, which resolves to keep */
        }
      }

      // The prompt was built with catVer; the user may have swapped the
      // category set while the model was streaming. A candidate validated
      // against a different set could assign the wrong meaning — drop it.
      if (getCategoryVersion() !== catVer) {
        await state.audit({ session: session.id, status: 'stale-categories' })
        return
      }

      const after = ctx.sessionTitle.get(session)
      const unchanged = (after?.eventSeq ?? null) === (before?.eventSeq ?? null) && (after?.title || '') === currentTitle
      if (!unchanged || ctx.sessions.get(session.id) !== session) {
        await state.audit({ session: session.id, status: 'stale', decision })
        return
      }

      let status = 'kept'
      if (decision.action === 'rename') {
        const checked = validateTitle(decision.title)
        if (!checked.ok) {
          await state.audit({ session: session.id, status: 'invalid-title', reason: checked.reason })
        } else {
          try {
            ctx.sessionTitle.rename(session, decision.title)
            const written = ctx.sessionTitle.get(session)
            if (written?.title !== decision.title) throw new Error('title did not round-trip')
            status = 'renamed'
          } catch (error) {
            await state.update(session.id, { lastAttemptAt: Date.now() })
            await state.audit({ session: session.id, status: 'write-failed', error: String(error?.message || error) })
            return
          }
        }
      }

      const latest = ctx.sessionTitle.get(session)
      await state.update(session.id, {
        lastSeq: latest?.eventSeq,
        lastTitle: latest?.title || currentTitle,
        lastMessageSeq: messages.at(-1).seq,
        fingerprint: print,
        lastAttemptAt: Date.now(),
        policyVersion: POLICY_VERSION,
        renames: (record?.renames || 0) + (status === 'renamed' ? 1 : 0),
        tokens: (record?.tokens || 0) + (raw.usage?.outputTokens || raw.usage?.completionTokens || 0),
        usage: raw.usage || record?.usage,
      })
      await state.audit({
        session: session.id,
        status,
        title: latest?.title || currentTitle,
        decision,
        reason: parsed.reason,
        ms: Date.now() - started,
        usage: raw.usage,
      })
    } finally {
      clearTimeout(timers.get(session.id))
      timers.delete(session.id)
      inFlight.delete(session.id)
      if (controllers.get(session.id) === controller) controllers.delete(session.id)
    }
  }

  ctx.on('session/event', (session, event) => {
    if (stopped || !event) return
    if (event.type === 'user/message') {
      if (event.data?.source?.kind !== 'user') return
      pending.add(session.id)
      schedule(session, cfg.debounceMs)
      return
    }
    // Durable turn boundaries: name as soon as the answer is committed.
    if (event.type === 'turn/end' || event.type === 'assistant/message') {
      if (!pending.has(session.id)) return
      pending.delete(session.id)
      schedule(session, 0)
      return
    }
    // First request of a session we have never seen (for example a resumed old
    // conversation): give it one pass even without a new title fingerprint.
    if (event.type === 'request/header') {
      void ready()
        .then(() => {
          if (stopped) return
          if (state.get(session.id)?.fingerprint) return
          schedule(session, cfg.headerDelayMs)
        })
        .catch(() => {})
    }
  })

  ctx.on('session/disposed', (session) => {
    cancel(session.id)
  })

  // Opening a historical conversation mounts it live: give it one pass so the
  // title catches up without waiting for a message.
  ctx.on('session/created', (session) => {
    if (stopped || !session) return
    schedule(session, cfg.headerDelayMs)
  })

  // Backfill: sessions that are already open when the host starts get one pass,
  // so a restart refreshes existing conversations instead of waiting for the
  // next message. Sequential on purpose: one model call at a time.
  async function sweepLiveSessions() {
    let list = []
    try {
      list = ctx.sessions.list()
    } catch {
      return
    }
    for (const session of list) {
      if (stopped || !cfg.enabled) return
      if (!session || ctx.sessions.get(session.id) !== session) continue
      try {
        await evaluate(session, { sweep: true })
      } catch (error) {
        log('debug', 'sweep failed', { error: String(error?.message || error) })
      }
    }
  }

  const sweepTimer = setTimeout(() => {
    void sweepLiveSessions().catch((error) => log('debug', 'sweep failed', { error: String(error?.message || error) }))
  }, cfg.sweepDelayMs)
  sweepTimer.unref?.()

  ctx.effect(() => () => {
    stopped = true
    clearTimeout(sweepTimer)
    for (const id of [...timers.keys()]) cancel(id)
    for (const controller of controllers.values()) controller.abort(new Error('dsh-claude-lite unloaded'))
    controllers.clear()
    pending.clear()
    void state.flush()
  }, 'dsh-claude-lite: title curator teardown')

  log('debug', `title curator active (state: ${titleDataDir()})`)
}
