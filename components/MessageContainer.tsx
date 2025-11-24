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
function estimateMessageHeight(text: string, maxWidth: number = 280, fontSize: number = 16): number {
  const padding = fontSize * 1.5 // Адаптивный padding
  const lineHeight = fontSize * 1.4
  const charsPerLine = Math.floor(maxWidth / (fontSize * 0.6)) // Примерно 0.6 * fontSize на символ
  const lines = Math.ceil(text.length / charsPerLine)
  return Math.max(padding + lines * lineHeight, fontSize * 3.75) // Минимум
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
  fontSize: number = 16,
  maxAttempts: number = 50
): { x: number; y: number } | null {
  const padding = Math.max(20, fontSize * 1.25)
  const messageHeight = estimateMessageHeight(text, messageWidth, fontSize)
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = Math.random() * (maxWidth - messageWidth - padding * 2) + padding
    const y = Math.random() * (maxHeight - messageHeight - padding * 2) + padding
    
    // Проверяем пересечение с существующими сообщениями
    let hasCollision = false
    for (const msg of existingMessages) {
      const existingHeight = estimateMessageHeight(msg.text, messageWidth, fontSize)
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
  const [isMobile, setIsMobile] = useState(false)
  const [scale, setScale] = useState(1)

  // Получаем размеры экрана и определяем тип устройства
  useEffect(() => {
    const updateDimensions = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isMobileDevice = width < 768 || (isTouchDevice && width < 1024)
      
      setIsMobile(isMobileDevice)
      
      if (!isMobileDevice) {
        // Десктоп - вычисляем масштаб для больших экранов
        const isLargeScreen = width >= 2000 || height >= 1000
        if (isLargeScreen) {
          const scaleFactor = Math.min(width / 1920, height / 1080)
          setScale(Math.max(1, Math.min(scaleFactor, 1.5)))
        } else {
          setScale(1)
        }
      } else {
        setScale(1)
      }
      
      setDimensions({
        width,
        height,
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
        // Адаптивные размеры для мобильных и десктопов
        let fontSize: number
        let messageWidth: number
        
        if (isMobile) {
          // Мобильные устройства - уменьшены в 1.5 раза
          fontSize = 11
          messageWidth = 187
        } else {
          // Десктоп - уменьшены в 2 раза
          fontSize = scale >= 1.3 ? 32 : scale >= 1.1 ? 25 : 18
          messageWidth = scale >= 1.3 ? 563 : scale >= 1.1 ? 450 : 315
        }
        
        const position = getRandomPosition(dimensions.width, dimensions.height, text, prevMessages, messageWidth, fontSize)
        
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
  }, [activeMessages.length, messageIndex, messages, maxConcurrent, dimensions, isMobile, scale])

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

