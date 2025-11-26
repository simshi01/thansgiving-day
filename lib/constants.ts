// Константы для управления временем показа сообщений

export const MESSAGE_DURATION = {
  MIN: 3, // минимум 3 секунды
  MAX: 10, // максимум 10 секунд
  DEFAULT: 4, // по умолчанию 4 секунды
} as const

export const MESSAGE_TIMING = {
  INTERVAL: 5000, // 5 секунд между сообщениями в радио режиме
  SPAWN_INTERVAL: 2500, // 2.5 секунды между появлением новых сообщений
} as const

export const MESSAGE_DISPLAY = {
  MIN_CONCURRENT: 3, // минимум сообщений на экране
  MAX_CONCURRENT: 6, // максимум сообщений на экране (для обычных экранов)
  MAX_CONCURRENT_LARGE: 10, // максимум для больших экранов
} as const

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
