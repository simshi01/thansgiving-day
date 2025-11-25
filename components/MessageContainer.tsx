'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { io, Socket } from 'socket.io-client'
import MessageBubble from './MessageBubble'

interface Message {
  id: string
  text: string
  x: number
  y: number
  duration: number
}

interface MessageContainerProps {
  messages?: string[] // Для обратной совместимости с тестовыми данными
  maxConcurrent?: number
}

// Расчет времени показа на основе длины текста
function calculateDuration(text: string): number {
  const baseTime = 2
  const readingSpeed = 50
  const additionalTime = text.length / readingSpeed
  return Math.max(baseTime, Math.min(baseTime + additionalTime, 8))
}

// Примерная оценка высоты сообщения
function estimateMessageHeight(text: string, maxWidth: number = 280, fontSize: number = 16): number {
  const padding = fontSize * 1.5
  const lineHeight = fontSize * 1.4
  const charsPerLine = Math.floor(maxWidth / (fontSize * 0.6))
  const lines = Math.ceil(text.length / charsPerLine)
  return Math.max(padding + lines * lineHeight, fontSize * 3.75)
}

// Проверка пересечения
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

interface MessageFromDB {
  id: string
  text: string
  duration: number
}

export default function MessageContainer({ messages: testMessages, maxConcurrent = 4 }: MessageContainerProps) {
  const [activeMessages, setActiveMessages] = useState<Message[]>([])
  const [messageQueue, setMessageQueue] = useState<MessageFromDB[]>([])
  const [socket, setSocket] = useState<Socket | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [isMobile, setIsMobile] = useState(false)
  const [scale, setScale] = useState(1)

  // Получаем размеры экрана
  useEffect(() => {
    const updateDimensions = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isMobileDevice = width < 768 || (isTouchDevice && width < 1024)
      
      setIsMobile(isMobileDevice)
      
      if (!isMobileDevice) {
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
      
      setDimensions({ width, height })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Генерация случайных позиций с учетом активных сообщений
  const generateRandomPosition = useCallback((existingMessages: Message[]): { x: number; y: number } => {
    const padding = 50
    const messageWidth = isMobile ? 200 : 350
    const messageHeight = isMobile ? 100 : 150
    const maxAttempts = 50
    
    // Если размеры еще не определены, возвращаем случайную позицию
    if (dimensions.width === 0 || dimensions.height === 0) {
      return {
        x: Math.random() * 500 + 50,
        y: Math.random() * 500 + 50,
      }
    }
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = Math.random() * (dimensions.width - messageWidth - padding * 2) + padding
      const y = Math.random() * (dimensions.height - messageHeight - padding * 2) + padding
      
      // Проверяем пересечение с существующими сообщениями
      let hasCollision = false
      for (const msg of existingMessages) {
        const msgWidth = isMobile ? 200 : 350
        const msgHeight = isMobile ? 100 : 150
        if (checkCollision(x, y, messageWidth, messageHeight, msg.x, msg.y, msgWidth, msgHeight, padding)) {
          hasCollision = true
          break
        }
      }
      
      if (!hasCollision) {
        return { x, y }
      }
    }
    
    // Если не удалось найти свободное место, возвращаем случайную позицию
    return {
      x: Math.random() * (dimensions.width - messageWidth) + padding,
      y: Math.random() * (dimensions.height - messageHeight) + padding,
    }
  }, [dimensions.width, dimensions.height, isMobile])
  
  // Обработчик новых сообщений через Socket.io
  const handleNewMessage = useCallback((data: { id: string; text: string; positionX: number; positionY: number; duration: number }) => {
    const newMessage: MessageFromDB = {
      id: data.id,
      text: data.text,
      duration: data.duration || calculateDuration(data.text),
    }
    
    setActiveMessages((currentActive) => {
      // Проверяем, нет ли уже такого сообщения
      if (currentActive.some(msg => msg.id.startsWith(newMessage.id))) {
        return currentActive
      }
      
      // Если есть место, показываем сразу
      if (currentActive.length < maxConcurrent) {
        const position = generateRandomPosition(currentActive)
        const displayId = `${newMessage.id}-${Date.now()}`
        
        const messageToShow: Message = {
          id: displayId,
          text: newMessage.text,
          x: position.x,
          y: position.y,
          duration: newMessage.duration,
        }
        
        // Также добавляем в очередь для повторного показа
        setMessageQueue((prev) => {
          if (prev.some(msg => msg.id === newMessage.id)) {
            return prev
          }
          return [...prev, newMessage]
        })
        
        return [...currentActive, messageToShow]
      }
      
      // Если нет места, добавляем в начало очереди
      setMessageQueue((prev) => {
        if (prev.some(msg => msg.id === newMessage.id)) {
          return prev
        }
        return [newMessage, ...prev]
      })
      
      return currentActive
    })
  }, [maxConcurrent, generateRandomPosition])

  // Подключение к Socket.io
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin
    const newSocket = io(socketUrl, {
      path: '/api/socket',
      transports: ['websocket', 'polling'],
    })

    newSocket.on('connect', () => {
      console.log('Connected to server')
      // Запрашиваем синхронизацию при подключении
      newSocket.emit('sync:request')
    })

    newSocket.on('sync:response', (data: { messages: Array<{ id: string; text: string; positionX: number; positionY: number; duration: number }> }) => {
      // Добавляем новые сообщения в очередь вместо прямого показа
      const newMessages: MessageFromDB[] = data.messages.map(msg => ({
        id: msg.id,
        text: msg.text,
        duration: msg.duration || calculateDuration(msg.text),
      }))
      
      setMessageQueue((prev) => {
        const existingIds = new Set(prev.map(m => m.id))
        const uniqueNewMessages = newMessages.filter(m => !existingIds.has(m.id))
        return [...prev, ...uniqueNewMessages]
      })
    })

    newSocket.on('message:new', handleNewMessage)

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server')
    })

    setSocket(newSocket)

    // Загрузка последних сообщений через API будет происходить в useEffect выше

    return () => {
      newSocket.off('message:new', handleNewMessage)
      newSocket.close()
    }
  }, [handleNewMessage])

  // Показ следующего сообщения из очереди
  const showNextMessage = useCallback(() => {
    setMessageQueue((queue) => {
      if (queue.length === 0) return queue
      
      setActiveMessages((currentActive) => {
        if (currentActive.length >= maxConcurrent) {
          return currentActive
        }
        
        const nextMessage = queue[0]
        
        // Генерируем новые позиции для этого показа с учетом текущих активных сообщений
        const position = generateRandomPosition(currentActive)
        
        // Создаем уникальный ID для этого показа (сообщение + timestamp)
        const displayId = `${nextMessage.id}-${Date.now()}`
        
        const messageToShow: Message = {
          id: displayId,
          text: nextMessage.text,
          x: position.x,
          y: position.y,
          duration: nextMessage.duration,
        }
        
        // Возвращаем сообщение в конец очереди для повторного показа
        setTimeout(() => {
          setMessageQueue((currentQueue) => [...currentQueue, nextMessage])
        }, 100)
        
        return [...currentActive, messageToShow]
      })
      
      return queue.slice(1)
    })
  }, [maxConcurrent, generateRandomPosition])

  // Удаление сообщения
  const handleMessageComplete = useCallback((id: string) => {
    setActiveMessages((prev) => {
      const updated = prev.filter((msg) => msg.id !== id)
      // После удаления показываем следующее сообщение
      setTimeout(() => showNextMessage(), 500)
      return updated
    })
  }, [showNextMessage])

  // Загрузка сообщений из БД и заполнение очереди
  const loadMessagesFromDB = useCallback(async () => {
    try {
      const response = await fetch('/api/messages?limit=100')
      const data = await response.json()
      
      if (data.success && data.messages && data.messages.length > 0) {
        const messages: MessageFromDB[] = data.messages.map((msg: any) => ({
          id: msg.id,
          text: msg.text,
          duration: msg.duration || calculateDuration(msg.text),
        }))
        
        // Перемешиваем сообщения для случайного порядка
        const shuffled = messages.sort(() => Math.random() - 0.5)
        setMessageQueue((prev) => {
          // Добавляем только новые сообщения
          const existingIds = new Set(prev.map(m => m.id))
          const newMessages = shuffled.filter(m => !existingIds.has(m.id))
          return [...prev, ...newMessages]
        })
      }
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }, [])

  // Инициализация очереди и начало показа сообщений
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0) {
      loadMessagesFromDB()
    }
  }, [dimensions.width, dimensions.height, loadMessagesFromDB])

  // Автоматический показ сообщений из очереди
  useEffect(() => {
    if (messageQueue.length === 0) {
      return
    }

    // Показываем следующее сообщение с задержкой, если есть место
    const timer = setTimeout(() => {
      setActiveMessages((current) => {
        if (current.length >= maxConcurrent) {
          return current
        }
        // showNextMessage обновит activeMessages внутри себя
        return current
      })
      // Проверяем еще раз перед вызовом
      if (activeMessages.length < maxConcurrent) {
        showNextMessage()
      }
    }, 2000) // Задержка 2 секунды между показами

    return () => clearTimeout(timer)
  }, [messageQueue.length, activeMessages.length, maxConcurrent, showNextMessage])

  // Периодическая загрузка новых сообщений из БД
  useEffect(() => {
    const interval = setInterval(() => {
      loadMessagesFromDB()
    }, 30000) // Обновляем каждые 30 секунд

    return () => clearInterval(interval)
  }, [loadMessagesFromDB])

  // Fallback на тестовые данные, если нет подключения к серверу
  useEffect(() => {
    if (testMessages && testMessages.length > 0 && activeMessages.length === 0 && !socket?.connected) {
      // Используем тестовые данные только если нет подключения
      const testMessage: Message = {
        id: `test-${Date.now()}`,
        text: testMessages[0],
        x: 100,
        y: 100,
        duration: calculateDuration(testMessages[0]),
      }
      setActiveMessages([testMessage])
    }
  }, [testMessages, activeMessages.length, socket])

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
