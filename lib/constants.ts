// Константы для управления временем показа сообщений

export const MESSAGE_DURATION = {
  MIN: 3, // минимум 3 секунды
  MAX: 10, // максимум 10 секунд
  DEFAULT: 4, // по умолчанию 4 секунды
} as const

export const MESSAGE_TIMING = {
  INTERVAL: 5000, // 5 секунд между сообщениями в радио режиме
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
