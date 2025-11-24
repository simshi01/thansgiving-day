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

export default function MessageContainer({ messages: testMessages, maxConcurrent = 4 }: MessageContainerProps) {
  const [activeMessages, setActiveMessages] = useState<Message[]>([])
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
      // Получаем активные сообщения с сервера
      const syncedMessages = data.messages.map(msg => ({
        id: msg.id,
        text: msg.text,
        x: msg.positionX || 0,
        y: msg.positionY || 0,
        duration: msg.duration || 5,
      }))
      setActiveMessages(syncedMessages)
    })

    newSocket.on('message:new', (data: { id: string; text: string; positionX: number; positionY: number; duration: number }) => {
      // Новое сообщение от сервера
      const newMessage: Message = {
        id: data.id,
        text: data.text,
        x: data.positionX,
        y: data.positionY,
        duration: data.duration,
      }
      
      setActiveMessages((prev) => {
        // Проверяем, нет ли уже такого сообщения
        if (prev.some(msg => msg.id === newMessage.id)) {
          return prev
        }
        return [...prev, newMessage]
      })
    })

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server')
    })

    setSocket(newSocket)

    // Загрузка последних сообщений через API
    fetch('/api/messages?limit=50')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.messages) {
          const apiMessages = data.messages
            .filter((msg: any) => {
              // Берем только сообщения за последние 30 секунд
              const createdAt = new Date(msg.createdAt)
              const now = new Date()
              return (now.getTime() - createdAt.getTime()) < 30000
            })
            .map((msg: any) => ({
              id: msg.id,
              text: msg.text,
              x: msg.positionX || 0,
              y: msg.positionY || 0,
              duration: msg.duration || 5,
            }))
          setActiveMessages(apiMessages)
        }
      })
      .catch(err => console.error('Error fetching messages:', err))

    return () => {
      newSocket.close()
    }
  }, [])

  // Удаление сообщения
  const handleMessageComplete = useCallback((id: string) => {
    setActiveMessages((prev) => prev.filter((msg) => msg.id !== id))
  }, [])

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
