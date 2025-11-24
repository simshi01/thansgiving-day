'use client'

import { motion } from 'framer-motion'
import { useEffect } from 'react'

interface MessageBubbleProps {
  text: string
  x: number
  y: number
  duration: number
  onComplete: () => void
}

export default function MessageBubble({ text, x, y, duration, onComplete }: MessageBubbleProps) {
  useEffect(() => {
    // Показываем сообщение на duration секунд, затем удаляем
    const timer = setTimeout(() => {
      onComplete()
    }, duration * 1000)

    return () => clearTimeout(timer)
  }, [duration, onComplete])

  return (
    <motion.div
      initial={{
        opacity: 0,
        filter: 'blur(40px)',
        y: 25,
      }}
      animate={{
        opacity: 1,
        filter: 'blur(0px)',
        y: 0,
      }}
      exit={{
        opacity: 0,
        filter: 'blur(40px)',
        y: 25,
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
        maxWidth: '280px',
        zIndex: 10,
      }}
    >
      <div
        style={{
          position: 'relative',
          padding: '12px 16px',
          backgroundColor: '#007AFF',
          borderRadius: '18px 18px 18px 0px',
          color: 'white',
          fontSize: '16px',
          lineHeight: '1.4',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          wordWrap: 'break-word',
        }}
      >
        {text}
      </div>
    </motion.div>
  )
}

