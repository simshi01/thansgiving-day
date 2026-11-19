// Хранилище сообщений и состояния антиспама.
//
// На Vercel: Upstash Redis (переменные UPSTASH_REDIS_REST_URL/TOKEN или
// KV_REST_API_URL/TOKEN — их добавляет сама интеграция Upstash в панели Vercel).
// Локально без этих переменных: в памяти процесса (после перезапуска всё пропадает).
//
// Команды Redis экономим: бесплатный тариф Upstash — 500 000 команд в месяц.
// Опрос экрана = 2 команды, отправка сообщения ≈ 12.

import { Redis } from '@upstash/redis'

export interface StoredMessage {
  id: number // порядковый номер, он же курсор для опроса
  text: string
  duration: number // секунды
  createdAt: number // ms
}

export interface Store {
  readonly kind: 'redis' | 'memory'
  addMessage(text: string, duration: number): Promise<StoredMessage>
  /** Сообщения с id > afterId (по возрастанию) */
  getMessagesAfter(afterId: number): Promise<StoredMessage[]>
  /** Удалённые id — чтобы экраны убрали их у себя */
  getDeletedIds(): Promise<number[]>
  deleteMessage(id: number): Promise<boolean>
  /** Сообщения после afterId и список удалённых — одним запросом */
  poll(afterId: number): Promise<{ messages: StoredMessage[]; deleted: number[] }>

  /** Занять «окно тишины» для ключа. false — если оно уже занято (слишком частая отправка) */
  claimGap(key: string, ms: number): Promise<boolean>
  /** Остаток окна тишины в мс (для Retry-After) */
  gapRemainingMs(key: string): Promise<number>
  /** Увеличить счётчики фиксированных окон, вернуть новые значения (по порядку) */
  incrWindows(items: { key: string; ttlMs: number }[]): Promise<number[]>
  /** Последние принятые тексты устройства (нормализованные) */
  getRecentTexts(key: string): Promise<string[]>
  pushRecentText(key: string, text: string, keep: number, ttlMs: number): Promise<void>
}

const P = 'tg:' // префикс ключей
const K = {
  seq: `${P}seq`,
  msgs: `${P}msgs`, // sorted set: score = id, member = JSON
  deleted: `${P}deleted`, // set удалённых id
}

// ---------- Redis ----------

function createRedisStore(redis: Redis): Store {
  const parse = (raw: unknown): StoredMessage | null => {
    try {
      return typeof raw === 'string' ? (JSON.parse(raw) as StoredMessage) : (raw as StoredMessage)
    } catch {
      return null
    }
  }
  const parseList = (raw: unknown[]) =>
    raw.map(parse).filter((m): m is StoredMessage => m !== null)

  return {
    kind: 'redis',

    async addMessage(text, duration) {
      const id = await redis.incr(K.seq)
      const msg: StoredMessage = { id, text, duration, createdAt: Date.now() }
      await redis.zadd(K.msgs, { score: id, member: JSON.stringify(msg) })
      return msg
    },

    async getMessagesAfter(afterId) {
      const raw = await redis.zrange<unknown[]>(K.msgs, `(${afterId}`, '+inf', { byScore: true })
      return parseList(raw)
    },

    async getDeletedIds() {
      const raw = await redis.smembers(K.deleted)
      return raw.map(Number).filter(Number.isFinite)
    },

    async poll(afterId) {
      const p = redis.pipeline()
      p.zrange(K.msgs, `(${afterId}`, '+inf', { byScore: true })
      p.smembers(K.deleted)
      const [raw, del] = (await p.exec()) as [unknown[], string[]]
      return { messages: parseList(raw), deleted: del.map(Number).filter(Number.isFinite) }
    },

    async deleteMessage(id) {
      const p = redis.pipeline()
      p.zremrangebyscore(K.msgs, id, id)
      p.sadd(K.deleted, String(id))
      const [removed] = (await p.exec()) as [number, number]
      return removed > 0
    },

    async claimGap(key, ms) {
      const res = await redis.set(`${P}gap:${key}`, '1', { nx: true, px: ms })
      return res === 'OK'
    },

    async gapRemainingMs(key) {
      const ttl = await redis.pttl(`${P}gap:${key}`)
      return Math.max(0, ttl)
    },

    async incrWindows(items) {
      const p = redis.pipeline()
      for (const it of items) {
        p.incr(`${P}w:${it.key}`)
        p.pexpire(`${P}w:${it.key}`, it.ttlMs)
      }
      const res = (await p.exec()) as number[]
      return items.map((_, i) => res[i * 2])
    },

    async getRecentTexts(key) {
      return redis.lrange<string>(`${P}t:${key}`, 0, -1)
    },

    async pushRecentText(key, text, keep, ttlMs) {
      const k = `${P}t:${key}`
      const p = redis.pipeline()
      p.lpush(k, text)
      p.ltrim(k, 0, keep - 1)
      p.pexpire(k, ttlMs)
      await p.exec()
    },
  }
}

// ---------- Память (локальная разработка) ----------

interface MemState {
  seq: number
  msgs: StoredMessage[]
  deleted: Set<number>
  expiring: Map<string, { value: number | string[]; expiresAt: number }>
}

function createMemoryStore(): Store {
  const g = globalThis as unknown as { __tgMemStore?: MemState }
  const s: MemState =
    g.__tgMemStore ??
    (g.__tgMemStore = { seq: 0, msgs: [], deleted: new Set(), expiring: new Map() })

  const get = (key: string) => {
    const e = s.expiring.get(key)
    if (!e) return undefined
    if (e.expiresAt <= Date.now()) {
      s.expiring.delete(key)
      return undefined
    }
    return e
  }
  // Изредка чистим протухшие ключи, чтобы память не росла
  const sweep = () => {
    if (s.expiring.size < 5000) return
    const now = Date.now()
    Array.from(s.expiring).forEach(([k, e]) => {
      if (e.expiresAt <= now) s.expiring.delete(k)
    })
  }

  const after = (afterId: number) => s.msgs.filter((m) => m.id > afterId)

  return {
    kind: 'memory',

    async addMessage(text, duration) {
      const msg: StoredMessage = { id: ++s.seq, text, duration, createdAt: Date.now() }
      s.msgs.push(msg)
      return msg
    },
    async getMessagesAfter(afterId) {
      return after(afterId)
    },
    async getDeletedIds() {
      return Array.from(s.deleted)
    },
    async poll(afterId) {
      return { messages: after(afterId), deleted: Array.from(s.deleted) }
    },
    async deleteMessage(id) {
      const i = s.msgs.findIndex((m) => m.id === id)
      if (i === -1) return false
      s.msgs.splice(i, 1)
      s.deleted.add(id)
      return true
    },

    async claimGap(key, ms) {
      sweep()
      const k = `gap:${key}`
      if (get(k)) return false
      s.expiring.set(k, { value: 1, expiresAt: Date.now() + ms })
      return true
    },
    async gapRemainingMs(key) {
      const e = get(`gap:${key}`)
      return e ? e.expiresAt - Date.now() : 0
    },
    async incrWindows(items) {
      return items.map((it) => {
        const k = `w:${it.key}`
        const e = get(k)
        const value = (typeof e?.value === 'number' ? e.value : 0) + 1
        s.expiring.set(k, { value, expiresAt: Date.now() + it.ttlMs })
        return value
      })
    },
    async getRecentTexts(key) {
      const e = get(`t:${key}`)
      return Array.isArray(e?.value) ? e.value : []
    },
    async pushRecentText(key, text, keep, ttlMs) {
      const k = `t:${key}`
      const e = get(k)
      const list = [text, ...(Array.isArray(e?.value) ? e.value : [])].slice(0, keep)
      s.expiring.set(k, { value: list, expiresAt: Date.now() + ttlMs })
    },
  }
}

// ---------- Выбор ----------

let cached: Store | null = null

export function getStore(): Store {
  if (cached) return cached
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (url && token) {
    cached = createRedisStore(new Redis({ url, token, automaticDeserialization: false }))
  } else {
    if (process.env.VERCEL) {
      console.warn('⚠️  Redis не подключён: сообщения хранятся в памяти и будут теряться. Подключите Upstash Redis в Storage проекта на Vercel.')
    }
    cached = createMemoryStore()
  }
  return cached
}
