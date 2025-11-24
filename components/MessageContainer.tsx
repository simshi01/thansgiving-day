'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import MessageBubble from './MessageBubble'

interface Message {
  id: string
  text: string
  x: number
  y: number
  duration: number
}

interface MessageContainerProps {
  messages: string[]
  maxConcurrent?: number
}

// Расчет времени показа на основе длины текста
// Примерно 50-60 символов в секунду для комфортного чтения
function calculateDuration(text: string): number {
  const baseTime = 2 // Минимальное время показа (2 секунды)
  const readingSpeed = 50 // Символов в секунду
  const additionalTime = text.length / readingSpeed
  return Math.max(baseTime, Math.min(baseTime + additionalTime, 8)) // Максимум 8 секунд
}

// Примерная оценка высоты сообщения на основе текста
function estimateMessageHeight(text: string, maxWidth: number = 280): number {
  const padding = 24 // 12px сверху + 12px снизу
  const lineHeight = 22.4 // 16px * 1.4
  const charsPerLine = Math.floor(maxWidth / 10) // Примерно 10px на символ
  const lines = Math.ceil(text.length / charsPerLine)
  return Math.max(padding + lines * lineHeight, 60) // Минимум 60px
}

// Проверка пересечения двух прямоугольников
function checkCollision(
  x1: number, y1: number, width1: number, height1: number,
  x2: number, y2: number, width2: number, height2: number,
  padding: number = 30
): boolean {
  return !(
    x1 + width1 + padding < x2 ||
    x2 + width2 + padding < x1 ||
    y1 + height1 + padding < y2 ||
    y2 + height2 + padding < y1
  )
}

// Генерация случайной позиции с проверкой пересечений
function getRandomPosition(
  maxWidth: number,
  maxHeight: number,
  text: string,
  existingMessages: Message[],
  messageWidth: number = 280,
  maxAttempts: number = 50
): { x: number; y: number } | null {
  const padding = 20
  const messageHeight = estimateMessageHeight(text, messageWidth)
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = Math.random() * (maxWidth - messageWidth - padding * 2) + padding
    const y = Math.random() * (maxHeight - messageHeight - padding * 2) + padding
    
    // Проверяем пересечение с существующими сообщениями
    let hasCollision = false
    for (const msg of existingMessages) {
      const existingHeight = estimateMessageHeight(msg.text, messageWidth)
      if (checkCollision(x, y, messageWidth, messageHeight, msg.x, msg.y, messageWidth, existingHeight)) {
        hasCollision = true
        break
      }
    }
    
    if (!hasCollision) {
      return { x, y }
    }
  }
  
  // Если не удалось найти позицию без пересечений, возвращаем случайную
  return {
    x: Math.random() * (maxWidth - messageWidth - padding * 2) + padding,
    y: Math.random() * (maxHeight - messageHeight - padding * 2) + padding,
  }
}

export default function MessageContainer({ messages, maxConcurrent = 4 }: MessageContainerProps) {
  const [activeMessages, setActiveMessages] = useState<Message[]>([])
  const [messageIndex, setMessageIndex] = useState(0)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  // Получаем размеры экрана
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Удаление сообщения из активных
  const handleMessageComplete = useCallback((id: string) => {
    setActiveMessages((prev) => prev.filter((msg) => msg.id !== id))
  }, [])

  // Добавление нового сообщения когда есть место
  useEffect(() => {
    if (messages.length === 0 || dimensions.width === 0) return
    if (activeMessages.length >= maxConcurrent) return

    // Задержка перед появлением нового сообщения (чтобы не все появлялись сразу)
    const delay = Math.random() * 2000 + 1000 // 1-3 секунды
    
    const timer = setTimeout(() => {
      setActiveMessages((prevMessages) => {
        // Проверяем еще раз, что есть место
        if (prevMessages.length >= maxConcurrent) return prevMessages
        
        const text = messages[messageIndex]
        const position = getRandomPosition(dimensions.width, dimensions.height, text, prevMessages)
        
        if (!position) return prevMessages // Не удалось найти позицию
        
        const duration = calculateDuration(text)

        const newMessage: Message = {
          id: `msg-${Date.now()}-${Math.random()}`,
          text,
          x: position.x,
          y: position.y,
          duration,
        }

        setMessageIndex((prev) => (prev + 1) % messages.length) // Зацикливаем
        return [...prevMessages, newMessage]
      })
    }, delay)

    return () => clearTimeout(timer)
  }, [activeMessages.length, messageIndex, messages, maxConcurrent, dimensions])

  return (
    <AnimatePresence>
      {activeMessages.map((message) => (
        <MessageBubble
          key={message.id}
          text={message.text}
          x={message.x}
          y={message.y}
          duration={message.duration}
          onComplete={() => handleMessageComplete(message.id)}
        />
      ))}
    </AnimatePresence>
  )
}

