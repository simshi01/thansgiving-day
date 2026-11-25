// Константы для управления временем показа сообщений

export const MESSAGE_DURATION = {
  MIN: 5, // минимум 5 секунд
  MAX: 15, // максимум 15 секунд
  DEFAULT: 8, // по умолчанию 8 секунд
  BUSY: 5, // когда новые сообщения стоят в очереди — показываем чуть короче, чтобы все успели
} as const

export const MESSAGE_TIMING = {
  INTERVAL: 5000, // 5 секунд между сообщениями в радио режиме
  SPAWN_INTERVAL: 2500, // 2.5 секунды между появлением новых сообщений
  FADE_OUT_RESERVE: 800, // место исчезающего пузыря не занимаем, пока он растворяется
  PUMP_STEP: 120, // пузыри выходят на экран по одному с таким интервалом (до ~8 в секунду)
  POLL_INTERVAL: 3000, // экран проверяет новые сообщения раз в 3 секунды
  POLL_INTERVAL_IDLE: 15000, // ...или раз в 15 секунд, если новых давно не было
  POLL_IDLE_AFTER: 10 * 60_000, // «давно» = 10 минут без новых сообщений
} as const

// Сколько пузырей одновременно и какого размера — см. lib/bubble-metrics.ts (зависит от экрана)

/**
 * Нормализует длительность показа сообщения
 * @param duration - длительность в секундах
 * @returns нормализованная длительность в секундах
 */
export function normalizeDuration(duration: number | null | undefined): number {
  if (!duration || duration <= 0) {
    return MESSAGE_DURATION.DEFAULT
  }
  return Math.max(MESSAGE_DURATION.MIN, Math.min(duration, MESSAGE_DURATION.MAX))
}
