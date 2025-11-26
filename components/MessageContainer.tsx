'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { io, Socket } from 'socket.io-client'
import MessageBubble from './MessageBubble'
import { normalizeDuration, MESSAGE_DISPLAY } from '@/lib/constants'

interface ScheduledMessage {
  id: string
  text: string
  duration: number
  showTime: number // время показа относительно начала цикла (мс)
  position: number
}

interface MessageContainerProps {
  messages?: string[] // Для обратной совместимости с тестовыми данными
  maxConcurrent?: number
}

export default function MessageContainer({ messages: testMessages, maxConcurrent = 4 }: MessageContainerProps) {
  const [activeMessages, setActiveMessages] = useState<Array<{
    id: string
    text: string
    x: number
    y: number
    duration: number
    scheduledId: string
  }>>([])

  const [schedule, setSchedule] = useState<ScheduledMessage[]>([])
  const [cycleDuration, setCycleDuration] = useState(0)
  const [serverTimeOffset, setServerTimeOffset] = useState(0) // разница между локальным и серверным временем
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [isMobile, setIsMobile] = useState(false)
  const [scale, setScale] = useState(1)
  const [isInitialized, setIsInitialized] = useState(false)
  const [maxConcurrentMessages, setMaxConcurrentMessages] = useState<number>(MESSAGE_DISPLAY.MAX_CONCURRENT)

  const scheduleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const cycleStartTimeRef = useRef<number>(0)
  const spawnIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const currentMessageIndexRef = useRef<number>(0) // индекс текущего сообщения в цикле (используем ref вместо state)
  const isSchedulerRunningRef = useRef<boolean>(false) // флаг, чтобы не запускать scheduler повторно
  const socketRef = useRef<Socket | null>(null)

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
          // Для больших экранов показываем больше сообщений
          setMaxConcurrentMessages(MESSAGE_DISPLAY.MAX_CONCURRENT_LARGE)
        } else {
          setScale(1)
          setMaxConcurrentMessages(MESSAGE_DISPLAY.MAX_CONCURRENT)
        }
      } else {
        setScale(1)
        setMaxConcurrentMessages(MESSAGE_DISPLAY.MIN_CONCURRENT)
      }

      setDimensions({ width, height })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Синхронизация времени с сервером
  const syncTimeWithServer = useCallback(async () => {
    try {
      const startTime = Date.now()
      const response = await fetch('/api/time')
      const endTime = Date.now()

      const data = await response.json()
      const serverTime = data.serverTime

      // Учитываем время задержки сети
      const networkDelay = (endTime - startTime) / 2
      const serverTimeAtResponse = serverTime + networkDelay

      setServerTimeOffset(serverTimeAtResponse - endTime)
    } catch (error) {
      console.error('Error syncing time:', error)
    }
  }, [])

  // Получение текущего синхронизированного времени
  const getSyncedTime = useCallback(() => {
    return Date.now() + serverTimeOffset
  }, [serverTimeOffset])

  // Генерация позиции для сообщения (случайная, но без пересечений)
  const generateMessagePosition = useCallback(() => {
    const padding = 50
    const messageWidth = isMobile ? 200 : 350
    const messageHeight = isMobile ? 100 : 150
    
    if (dimensions.width === 0 || dimensions.height === 0) {
      return { x: 100, y: 100 }
    }
    
    // Простая генерация - случайная позиция без проверки пересечений для радио режима
      const x = Math.random() * (dimensions.width - messageWidth - padding * 2) + padding
      const y = Math.random() * (dimensions.height - messageHeight - padding * 2) + padding
      
    return { x, y }
  }, [dimensions, isMobile])

  // Загрузка расписания сообщений
  const loadSchedule = useCallback(async () => {
    try {
      const response = await fetch('/api/schedule')
      const data = await response.json()

      if (data.schedule && data.schedule.length > 0) {
        setSchedule(data.schedule)
        setCycleDuration(data.cycleDuration)
        console.log(`Loaded schedule with ${data.schedule.length} messages, cycle duration: ${data.cycleDuration}ms`)
      } else {
        setSchedule([])
        setCycleDuration(0)
        console.log('No messages in schedule')
      }
    } catch (error) {
      console.error('Error loading schedule:', error)
      setSchedule([])
      setCycleDuration(0)
    }
  }, [])

  // Показ сообщения по расписанию
  const showScheduledMessage = useCallback((scheduledMessage: ScheduledMessage) => {
    const position = generateMessagePosition()
    // Используем crypto.randomUUID() для гарантированно уникального ID
    const displayId = crypto.randomUUID()

    // Нормализуем duration с помощью общей функции
    const durationInSeconds = scheduledMessage.duration / 1000
    const normalizedDuration = normalizeDuration(durationInSeconds)

    const messageToShow = {
      id: displayId,
      text: scheduledMessage.text,
      x: position.x,
      y: position.y,
      duration: normalizedDuration,
      scheduledId: scheduledMessage.id,
    }

    // Просто добавляем сообщение без удаления предыдущих
    // Каждое сообщение управляет своим таймером независимо
    setActiveMessages(prev => [...prev, messageToShow])
  }, [generateMessagePosition])

  // Запуск планировщика сообщений с постепенным появлением
  const startScheduler = useCallback(() => {
    if (schedule.length === 0) {
      console.log('No schedule to start')
      return
    }

    // Проверяем, не запущен ли уже scheduler
    if (isSchedulerRunningRef.current) {
      console.log('Scheduler already running, skipping')
      return
    }

    isSchedulerRunningRef.current = true

    console.log(`Starting scheduler with ${schedule.length} messages, max concurrent: ${maxConcurrentMessages}`)

    // Функция для показа следующего сообщения
    const showNextMessage = () => {
      if (schedule.length === 0) return

      // Получаем следующее сообщение из цикла
      const messageToShow = schedule[currentMessageIndexRef.current % schedule.length]

      // Увеличиваем индекс для следующего раза
      currentMessageIndexRef.current = (currentMessageIndexRef.current + 1) % schedule.length

      // Показываем сообщение
      showScheduledMessage(messageToShow)
    }

    // Показываем первые сообщения постепенно до достижения maxConcurrent
    const initialCount = Math.min(maxConcurrentMessages, schedule.length)
    for (let i = 0; i < initialCount; i++) {
      setTimeout(() => showNextMessage(), i * 500) // 500мс между первыми сообщениями
    }

    // Интервал больше не нужен - новые сообщения появятся через handleMessageComplete
  }, [schedule, maxConcurrentMessages, showScheduledMessage])

  // Удаление завершившегося сообщения и показ следующего
  const handleMessageComplete = useCallback((id: string) => {
    setActiveMessages(prev => prev.filter(msg => msg.id !== id))

    // Когда сообщение исчезает, показываем следующее из цикла
    if (schedule.length > 0) {
      const messageToShow = schedule[currentMessageIndexRef.current % schedule.length]
      currentMessageIndexRef.current = (currentMessageIndexRef.current + 1) % schedule.length

      // Небольшая задержка перед показом следующего
      setTimeout(() => {
        showScheduledMessage(messageToShow)
      }, 300)
    }
  }, [schedule, showScheduledMessage])

  // Инициализация
  useEffect(() => {
    const initialize = async () => {
      if (dimensions.width === 0 || dimensions.height === 0) return

      console.log('Initializing radio mode...')

      // Синхронизируем время
      await syncTimeWithServer()

      // Загружаем расписание
      await loadSchedule()

      setIsInitialized(true)
    }

    if (!isInitialized) {
      initialize()
    }
  }, [dimensions, isInitialized, syncTimeWithServer, loadSchedule])

  // Запуск планировщика после инициализации
  useEffect(() => {
    if (isInitialized && schedule.length > 0 && !isSchedulerRunningRef.current) {
      startScheduler()
    }

    return () => {
      if (scheduleTimerRef.current) {
        clearTimeout(scheduleTimerRef.current)
      }
      if (spawnIntervalRef.current) {
        clearInterval(spawnIntervalRef.current)
      }
      // Сбрасываем флаг при размонтировании
      isSchedulerRunningRef.current = false
    }
  }, [isInitialized, schedule, startScheduler])

  // Периодическая синхронизация времени
  useEffect(() => {
    const interval = setInterval(syncTimeWithServer, 60000) // каждую минуту
    return () => clearInterval(interval)
  }, [syncTimeWithServer])

  // Периодическая перезагрузка расписания
  useEffect(() => {
    const interval = setInterval(loadSchedule, 300000) // каждые 5 минут
    return () => clearInterval(interval)
  }, [loadSchedule])

  // Fallback на тестовые данные, если нет расписания
  useEffect(() => {
    if (testMessages && testMessages.length > 0 && schedule.length === 0 && !isInitialized) {
      console.log('Using test messages as fallback')

      const testSchedule: ScheduledMessage[] = testMessages.map((text, index) => ({
        id: `test-${index}`,
        text,
        duration: 4000,
        showTime: index * 5000,
        position: index,
      }))

      setSchedule(testSchedule)
      setCycleDuration(testMessages.length * 5000)
    }
  }, [testMessages, schedule.length, isInitialized])

  // Подключение к Socket.io для real-time обновлений
  useEffect(() => {
    if (!isInitialized) return

    console.log('Connecting to Socket.io...')

    // Подключаемся к socket серверу
    const socket = io({
      path: '/api/socket',
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('Socket.io connected')
    })

    socket.on('disconnect', () => {
      console.log('Socket.io disconnected')
    })

    // Обработка нового сообщения
    socket.on('message:new', (data: { id: string; text: string; duration: number }) => {
      console.log('New message received:', data)

      // Нормализуем duration (приходит в секундах из БД)
      const durationInSeconds = normalizeDuration(data.duration)
      const durationInMs = durationInSeconds * 1000

      const newMessage: ScheduledMessage = {
        id: data.id,
        text: data.text,
        duration: durationInMs,
        showTime: 0, // не важно для нового сообщения
        position: 0, // position не важен, используем prev.length
      }

      // Добавляем в schedule для цикла
      setSchedule(prev => [...prev, newMessage])

      // Показываем сразу (если есть место на экране)
      // Используем setActiveMessages с prev для актуального значения
      setActiveMessages(prevActive => {
        if (prevActive.length < maxConcurrentMessages) {
          // Генерируем позицию и показываем сообщение
          const position = generateMessagePosition()
          const displayId = crypto.randomUUID()

          return [...prevActive, {
            id: displayId,
            text: newMessage.text,
            x: position.x,
            y: position.y,
            duration: durationInSeconds,
            scheduledId: newMessage.id,
          }]
        }
        return prevActive
      })
    })

    // Обработка удаления сообщения
    socket.on('message:deleted', (data: { id: string }) => {
      console.log('Message deleted:', data.id)

      // Удаляем из schedule
      setSchedule(prev => prev.filter(msg => msg.id !== data.id))

      // Удаляем из активных сообщений (если показывается)
      setActiveMessages(prev => prev.filter(msg => msg.scheduledId !== data.id))
    })

    // Отключаемся при размонтировании
    return () => {
      console.log('Disconnecting Socket.io...')
      socket.disconnect()
    }
  }, [isInitialized, maxConcurrentMessages, generateMessagePosition])

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
