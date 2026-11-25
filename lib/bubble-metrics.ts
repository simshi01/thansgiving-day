// Размеры пузырей и сколько их помещается на экране.
// Единое место для MessageBubble (как рисовать) и MessageContainer (куда ставить и сколько).

export interface BubbleMetrics {
  isMobile: boolean
  fontSize: number
  maxWidth: number
  blur: number // размытие при появлении/исчезновении
  offsetY: number // насколько пузырь «всплывает» снизу
  slots: number // сколько пузырей одновременно на экране
}

export function getBubbleMetrics(width: number, height: number, isTouch: boolean): BubbleMetrics {
  const isMobile = width < 768 || (isTouch && width < 1024)
  if (isMobile) {
    return { isMobile, fontSize: 11, maxWidth: 187, blur: 30, offsetY: 20, slots: 3 }
  }
  // Большой экран в зале: размер текста — от высоты экрана, чтобы читалось из конца зала.
  // 1080 px по высоте -> шрифт 32 px (~3% высоты). Ширина экрана на размер не влияет:
  // на широком 2970x1080 пузыри того же размера, просто их помещается больше.
  const fontSize = Math.round(Math.min(48, Math.max(18, height * 0.03)))
  const maxWidth = Math.round(fontSize * 17.6) // 32 px -> 563 px: 2–3 строки на благодарность
  // Сколько пузырей: экран должен выглядеть полным — «благодарностей очень много».
  // Пузыри могут слегка накладываться друг на друга, это нормально.
  // 2970x1080 -> 30, 1920x1080 -> 25.
  const typicalBubbleArea = maxWidth * fontSize * 4.5
  const slots = Math.max(4, Math.min(30, Math.floor((width * height) / typicalBubbleArea)))
  return {
    isMobile,
    fontSize,
    maxWidth,
    // Размытие при появлении — самая тяжёлая часть анимации для видеокарты; держим умеренным
    blur: Math.min(24, Math.round(fontSize * 1.9)),
    offsetY: Math.round(fontSize * 1.25),
    slots,
  }
}

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
}

// Примерный размер пузыря на экране (с запасом на хвостик и анимацию появления) —
// нужен, чтобы ставить новые пузыри на свободное место.
export function estimateBubbleSize(text: string, m: BubbleMetrics): { w: number; h: number } {
  const k = m.fontSize / 17
  const padX = 12 * k * 2
  const padY = 7 * k * 2
  const textWidth = Array.from(text).length * m.fontSize * 0.56
  const lines = Math.max(1, Math.ceil(textWidth / (m.maxWidth - padX)))
  const w = Math.min(m.maxWidth, textWidth + padX) + 7 * k + 16
  const h = lines * m.fontSize * 1.3 + padY + 5 * k + m.offsetY * 0.5 + 16
  return { w, h }
}
