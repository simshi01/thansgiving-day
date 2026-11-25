'use client'

import { motion } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'
import { getBubbleMetrics, isTouchDevice, type BubbleMetrics } from '@/lib/bubble-metrics'

// Синий цвет iMessage в тёмной теме iOS
const IMESSAGE_BLUE = '#0A84FF'

interface MessageBubbleProps {
  text: string
  x: number
  y: number
  duration: number
  onComplete: () => void
}

export default function MessageBubble({ text, x, y, duration, onComplete }: MessageBubbleProps) {
  // Размеры — от размера экрана (общие правила в lib/bubble-metrics.ts)
  const [metrics, setMetrics] = useState<BubbleMetrics>(() =>
    getBubbleMetrics(typeof window !== 'undefined' ? window.innerWidth : 1920, typeof window !== 'undefined' ? window.innerHeight : 1080, isTouchDevice())
  )

  // Используем ref для хранения onComplete, чтобы избежать пересоздания таймера
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    const update = () => setMetrics(getBubbleMetrics(window.innerWidth, window.innerHeight, isTouchDevice()))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    // Показываем сообщение на duration секунд, затем удаляем
    const timer = setTimeout(() => {
      onCompleteRef.current()
    }, duration * 1000)

    // Обязательно очищаем таймер при размонтировании или изменении duration
    return () => {
      clearTimeout(timer)
    }
  }, [duration])

  const { fontSize, maxWidth, blur: blurAmount, offsetY } = metrics

  // Пропорции пузыря iMessage (iOS: шрифт 17px, скругление 18px, отступы 7px/12px).
  // Всё масштабируется от размера шрифта, чтобы хвостик выглядел одинаково на любом экране.
  const k = fontSize / 17
  const radius = 18 * k
  const padding = `${7 * k}px ${12 * k}px`
  // Хвостик выступает за правый край пузыря на 7 единиц и опускается ниже его низа на 5
  const tailOverhang = 7 * k
  const tailDrop = 5 * k

  return (
    <motion.div
      initial={{
        opacity: 0,
        filter: `blur(${blurAmount}px)`,
        y: offsetY,
      }}
      animate={{
        opacity: 1,
        filter: 'blur(0px)',
        y: 0,
      }}
      exit={{
        opacity: 0,
        filter: `blur(${blurAmount}px)`,
        y: offsetY,
      }}
      transition={{
        duration: 1,
        ease: 'easeInOut',
        exit: {
          duration: 0.5,
          ease: 'easeInOut',
        },
      }}
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        maxWidth: `${maxWidth}px`,
        zIndex: 10,
      }}
    >
      <div
        style={{
          position: 'relative',
          padding,
          backgroundColor: IMESSAGE_BLUE,
          borderRadius: `${radius}px`,
          color: 'white',
          fontSize: `${fontSize}px`,
          lineHeight: 1.3,
          letterSpacing: '-0.01em',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
          wordWrap: 'break-word',
        }}
      >
        {/* Хвостик iMessage: правый край пузыря плавно уходит вниз-вправо в острый кончик,
            а между кончиком и низом пузыря остаётся скруглённая выемка.
            Координаты: (0, 0) — нижний правый угол пузыря, y растёт вниз.
            Стоит до текста, чтобы текст рисовался поверх и не обрезался. */}
        <svg
          aria-hidden
          viewBox="-18 -18 25 23"
          width={radius + tailOverhang}
          height={radius + tailDrop}
          style={{
            position: 'absolute',
            right: -tailOverhang,
            bottom: -tailDrop,
            display: 'block',
          }}
        >
          <path
            d="M-18 0 L-10 0 C-7 0 -5.5 -0.8 -4.6 -2 C-3 0.6 1 3.4 5.6 3.6 Q6.6 3.6 6 3 C2 1.4 0 -1.5 0 -7 L0 -18 L-18 -18 Z"
            fill={IMESSAGE_BLUE}
          />
        </svg>
        <span style={{ position: 'relative' }}>{text}</span>
      </div>
    </motion.div>
  )
}

