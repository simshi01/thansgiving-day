// Антиспам. Состояние — в общем хранилище (lib/store.ts): на Vercel это Redis,
// поэтому лимиты работают, даже когда запросы попадают на разные копии сервера.
//
// Главное правило: ограничиваем отдельного человека (устройство), а не зал.
// Все в зале сидят на одном Wi-Fi, поэтому лимит по IP — только мягкий общий потолок.
// Одинаковые сообщения от РАЗНЫХ людей разрешены: «За маму» честно пишут многие.

import { getStore } from './store'

export type SpamResult =
  | { ok: true }
  | { ok: false; reason: string; retryAfterSec?: number }

export interface SpamInput {
  text: string
  deviceId?: string | null
  ip?: string | null
}

// ---- Лимиты ----
export const LIMITS = {
  deviceMinGapMs: 10_000, // не чаще раза в 10 секунд
  devicePerMinute: 3,
  devicePerHour: 15,
  ipPerMinute: 60, // общий потолок на весь зал (одна Wi-Fi сеть)
  deviceDupWindowMs: 24 * 60 * 60_000, // своё же сообщение нельзя повторить в течение суток
  deviceRecentKeep: 50, // сколько последних текстов устройства помнить для проверки повторов
  nearDupSimilarity: 0.8, // «почти то же самое» тоже считается повтором
  repeatedWordRatio: 0.6,
  repeatedWordMinWords: 4,
  maxKeyLen: 400, // ограничение длины нормализованного текста
} as const

const MINUTE = 60_000
const HOUR = 60 * MINUTE

// ---- Идентификация клиента ----
const DEVICE_ID_RE = /^[A-Za-z0-9-]{8,64}$/

export function parseDeviceId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  return DEVICE_ID_RE.test(v) ? v : null
}

export function getClientIp(headers: { get(name: string): string | null }): string {
  // Vercel сам выставляет x-real-ip и перезаписывает x-forwarded-for реальным адресом.
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real.slice(0, 64)
  // Если прокси дописывает адрес в конец списка — берём последний: начало может подделать клиент.
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
    const last = parts[parts.length - 1]
    if (last) return last.slice(0, 64)
  }
  return 'unknown'
}

function deviceKey(deviceId: string | null | undefined, ip: string | null | undefined) {
  const id = parseDeviceId(deviceId)
  return id ? `d:${id}` : `ip:${ip || 'unknown'}`
}

// ---- Нормализация ----
// RegExp-конструктор: tsconfig target es5 не принимает флаг u в литералах
const NON_WORD_RE = new RegExp(String.raw`[^\p{L}\p{N}\s]`, 'gu')
const REPEAT_LETTER_RE = new RegExp(String.raw`(\p{L})\1{2,}`, 'gu')
const LETTER_RE = new RegExp(String.raw`\p{L}`, 'gu')
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(NON_WORD_RE, '') // пунктуация, эмодзи
    .replace(/\s+/g, ' ')
    .trim()
    .replace(REPEAT_LETTER_RE, '$1')
    .slice(0, LIMITS.maxKeyLen)
}

// ---- Эвристики содержимого ----
const URL_RE = new RegExp(String.raw`https?:\/\/|www\.|t\.me|[\p{L}\p{N}-]+\.(?:ru|com|рф|net|org|io|ly|su|ua|by|kz|info|biz|xyz|top|club|online|site|shop|app|dev|link|cc|tk)(?![\p{L}\p{N}])`, 'iu')
const HANDLE_RE = new RegExp(String.raw`@[\p{L}\p{N}_]{2,}`, 'u')

function contentRejection(text: string, normalized: string): string | null {
  if (URL_RE.test(text) || HANDLE_RE.test(text)) {
    return 'Ссылки и контакты отправлять нельзя'
  }
  const digits = (text.match(/\d/g) || []).length
  if (digits >= 7) {
    return 'Ссылки и контакты отправлять нельзя'
  }
  const letters = (text.match(LETTER_RE) || []).length
  if (letters < 2) {
    return 'Напиши, пожалуйста, пару слов 🙂'
  }
  const compact = text.replace(/\s+/g, '')
  if (compact.length >= 4 && new Set(compact.split('')).size === 1) {
    return 'Напиши, пожалуйста, настоящую благодарность 🙂'
  }
  const words = normalized.split(' ').filter(Boolean)
  if (words.length >= LIMITS.repeatedWordMinWords) {
    const counts = new Map<string, number>()
    let max = 0
    for (const w of words) {
      const c = (counts.get(w) || 0) + 1
      counts.set(w, c)
      if (c > max) max = c
    }
    if (max / words.length > LIMITS.repeatedWordRatio) {
      return 'Слишком много повторов. Напиши по-разному 🙂'
    }
  }
  return null
}

// ---- Похожесть текстов ----
// Текст без пробелов — для сравнения «почти одинаковых» сообщений
function squash(s: string): string {
  return s.replace(/\s+/g, '')
}

// Похожесть строк 0..1 по расстоянию Левенштейна (строки короткие, до 300 символов)
function similarity(a: string, b: string): number {
  if (a === b) return 1
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  // Слишком разная длина — точно не повтор, не считаем
  if (Math.min(a.length, b.length) / maxLen < LIMITS.nearDupSimilarity) return 0
  let prev = new Array(b.length + 1)
  let cur = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    const tmp = prev
    prev = cur
    cur = tmp
  }
  return 1 - prev[b.length] / maxLen
}

function retrySec(ms: number) {
  return Math.max(1, Math.ceil(ms / 1000))
}

// ---- Публичный API ----

/**
 * Проверка перед сохранением. Попытки, прошедшие 10-секундный интервал,
 * засчитываются в лимиты (даже если потом отклонены по содержимому или как повтор),
 * чтобы боты, долбящие сервер, упирались в лимиты.
 */
export async function checkSpam(input: SpamInput): Promise<SpamResult> {
  const store = getStore()
  const now = Date.now()
  const text = typeof input.text === 'string' ? input.text : ''
  const ip = input.ip || 'unknown'
  const key = deviceKey(input.deviceId, ip)

  // 1. Не чаще раза в 10 секунд с устройства
  if (!(await store.claimGap(key, LIMITS.deviceMinGapMs))) {
    const left = await store.gapRemainingMs(key)
    return {
      ok: false,
      reason: 'Не так быстро 🙂 Подожди несколько секунд',
      retryAfterSec: retrySec(left || LIMITS.deviceMinGapMs),
    }
  }

  // 2. Счётчики по минутам/часам (фиксированные окна)
  const minute = Math.floor(now / MINUTE)
  const hour = Math.floor(now / HOUR)
  const [ipMin, devMin, devHour] = await store.incrWindows([
    { key: `ipm:${ip}:${minute}`, ttlMs: 2 * MINUTE },
    { key: `dm:${key}:${minute}`, ttlMs: 2 * MINUTE },
    { key: `dh:${key}:${hour}`, ttlMs: 2 * HOUR },
  ])
  if (ipMin > LIMITS.ipPerMinute) {
    return {
      ok: false,
      reason: 'Сейчас слишком много сообщений. Попробуй через минуту 🙂',
      retryAfterSec: retrySec((minute + 1) * MINUTE - now),
    }
  }
  if (devMin > LIMITS.devicePerMinute) {
    return {
      ok: false,
      reason: 'Ты отправляешь слишком часто 🙂 Подожди минутку',
      retryAfterSec: retrySec((minute + 1) * MINUTE - now),
    }
  }
  if (devHour > LIMITS.devicePerHour) {
    return {
      ok: false,
      reason: 'Ты отправил много сообщений. Попробуй чуть позже 🙂',
      retryAfterSec: retrySec((hour + 1) * HOUR - now),
    }
  }

  // 3. Содержимое
  const normalized = normalizeText(text)
  const bad = contentRejection(text, normalized)
  if (bad) return { ok: false, reason: bad }

  // 4. Повторы этого же человека: точные и «почти такие же»
  const squashed = squash(normalized)
  const recent = await store.getRecentTexts(key)
  for (const prev of recent) {
    if (prev === normalized || similarity(squash(prev), squashed) >= LIMITS.nearDupSimilarity) {
      return { ok: false, reason: 'Ты уже отправил это сообщение. Напиши что-то новое 🙂' }
    }
  }

  return { ok: true }
}

/** Вызывать только после успешного сохранения сообщения. */
export async function recordAccepted(input: SpamInput): Promise<void> {
  const key = deviceKey(input.deviceId, input.ip)
  const normalized = normalizeText(typeof input.text === 'string' ? input.text : '')
  await getStore().pushRecentText(key, normalized, LIMITS.deviceRecentKeep, LIMITS.deviceDupWindowMs)
}
