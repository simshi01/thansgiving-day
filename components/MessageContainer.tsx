'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import MessageBubble from './MessageBubble'
import { normalizeDuration, MESSAGE_DISPLAY, MESSAGE_TIMING } from '@/lib/constants'

interface ScheduledMessage {
  id: string
  text: string
  duration: number // секунды (уже нормализованные)
}

interface ApiMessage {
  id: number
  text: string
  duration: number
}

interface ActiveMessage {
  id: string
  text: string
  x: number
  y: number
  duration: number
  scheduledId: string
}

interface MessageContainerProps {
  messages?: string[] // тестовые данные, если сервер пуст
  maxConcurrent?: number
}

const toScheduled = (m: ApiMessage): ScheduledMessage => ({
  id: String(m.id),
  text: m.text,
  duration: normalizeDuration(m.duration),
})

export default function MessageContainer({ messages: testMessages }: MessageContainerProps) {
  const [activeMessages, setActiveMessages] = useState<ActiveMessage[]>([])
  const [schedule, setSchedule] = useState<ScheduledMessage[]>([])
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [isMobile, setIsMobile] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [maxConcurrentMessages, setMaxConcurrentMessages] = useState<number>(MESSAGE_DISPLAY.MAX_CONCURRENT)

  const currentMessageIndexRef = useRef(0) // индекс следующего сообщения в цикле
  const isSchedulerRunningRef = useRef(false)
  const lastIdRef = useRef(0) // курсор опроса: самый большой id, который уже получили

  // Актуальные значения для колбэков опроса
  const scheduleRef = useRef(schedule)
  const activeRef = useRef(activeMessages)
  const maxConcurrentRef = useRef(maxConcurrentMessages)
  const dimensionsRef = useRef(dimensions)
  const isMobileRef = useRef(isMobile)
  useEffect(() => { scheduleRef.current = schedule }, [schedule])
  useEffect(() => { activeRef.current = activeMessages }, [activeMessages])
  useEffect(() => { maxConcurrentRef.current = maxConcurrentMessages }, [maxConcurrentMessages])
  useEffect(() => { dimensionsRef.current = dimensions }, [dimensions])
  useEffect(() => { isMobileRef.current = isMobile }, [isMobile])

  // Размеры экрана и сколько сообщений показывать одновременно
  useEffect(() => {
    const updateDimensions = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isMobileDevice = width < 768 || (isTouchDevice && width < 1024)

      setIsMobile(isMobileDevice)
      if (isMobileDevice) {
        setMaxConcurrentMessages(MESSAGE_DISPLAY.MIN_CONCURRENT)
      } else if (width >= 2000 || height >= 1000) {
        setMaxConcurrentMessages(MESSAGE_DISPLAY.MAX_CONCURRENT_LARGE)
      } else {
        setMaxConcurrentMessages(MESSAGE_DISPLAY.MAX_CONCURRENT)
      }
      setDimensions({ width, height })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Случайная позиция сообщения на экране
  const randomPosition = useCallback(() => {
    const padding = 50
    const { width, height } = dimensionsRef.current
    const messageWidth = isMobileRef.current ? 200 : 350
    const messageHeight = isMobileRef.current ? 100 : 150
    if (width === 0 || height === 0) return { x: 100, y: 100 }
    return {
      x: Math.random() * Math.max(1, width - messageWidth - padding * 2) + padding,
      y: Math.random() * Math.max(1, height - messageHeight - padding * 2) + padding,
    }
  }, [])

  const showMessage = useCallback((m: ScheduledMessage) => {
    const { x, y } = randomPosition()
    setActiveMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: m.text, x, y, duration: m.duration, scheduledId: m.id },
    ])
  }, [randomPosition])

  // Следующее сообщение по кругу — по возможности то, которого сейчас нет на экране
  const nextFromCycle = useCallback((): ScheduledMessage | null => {
    const list = scheduleRef.current
    if (list.length === 0) return null
    const onScreen = new Set(activeRef.current.map((a) => a.scheduledId))
    for (let tries = 0; tries < list.length; tries++) {
      const m = list[currentMessageIndexRef.current % list.length]
      currentMessageIndexRef.current = (currentMessageIndexRef.current + 1) % list.length
      if (!onScreen.has(m.id)) return m
    }
    return null // всё уже на экране
  }, [])

  // Запуск показа: первые сообщения появляются постепенно
  const startScheduler = useCallback(() => {
    if (isSchedulerRunningRef.current || scheduleRef.current.length === 0) return
    isSchedulerRunningRef.current = true
    const initialCount = Math.min(maxConcurrentRef.current, scheduleRef.current.length)
    for (let i = 0; i < initialCount; i++) {
      setTimeout(() => {
        const m = nextFromCycle()
        if (m) showMessage(m)
      }, i * 500)
    }
  }, [nextFromCycle, showMessage])

  // Сообщение исчезло — показываем следующее из цикла
  const handleMessageComplete = useCallback((id: string) => {
    setActiveMessages((prev) => prev.filter((msg) => msg.id !== id))
    setTimeout(() => {
      if (activeRef.current.length >= maxConcurrentRef.current) return
      const m = nextFromCycle()
      if (m) showMessage(m)
    }, 300)
  }, [nextFromCycle, showMessage])

  // Новые сообщения и удаления с сервера
  const applyServerData = useCallback((incoming: ApiMessage[], deleted: number[]) => {
    if (deleted.length > 0) {
      const del = new Set(deleted.map(String))
      if (scheduleRef.current.some((m) => del.has(m.id))) {
        setSchedule((prev) => prev.filter((m) => !del.has(m.id)))
      }
      if (activeRef.current.some((m) => del.has(m.scheduledId))) {
        setActiveMessages((prev) => prev.filter((m) => !del.has(m.scheduledId)))
      }
    }

    const fresh = incoming.filter((m) => m.id > lastIdRef.current)
    if (fresh.length === 0) return
    lastIdRef.current = Math.max(lastIdRef.current, ...fresh.map((m) => m.id))
    const scheduled = fresh.map(toScheduled)
    setSchedule((prev) => [...prev, ...scheduled])

    // Если показ уже идёт — новые сообщения сразу на экран (если есть место).
    // Если ещё не идёт — их подхватит startScheduler.
    if (isSchedulerRunningRef.current) {
      let room = maxConcurrentRef.current - activeRef.current.length
      for (const m of scheduled) {
        if (room <= 0) break
        showMessage(m)
        room--
      }
    }
  }, [showMessage])

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages?after=${lastIdRef.current}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      applyServerData(data.messages ?? [], data.deleted ?? [])
    } catch (error) {
      console.error('Error fetching messages:', error)
    }
  }, [applyServerData])

  // Первая загрузка — когда известны размеры экрана
  useEffect(() => {
    if (isInitialized || dimensions.width === 0) return
    fetchMessages().finally(() => setIsInitialized(true))
  }, [dimensions, isInitialized, fetchMessages])

  // Опрос новых сообщений. Бережём лимит бесплатного Redis:
  // - вкладка скрыта → не опрашиваем совсем;
  // - долго нет новых сообщений → опрашиваем реже, при новом — снова часто.
  useEffect(() => {
    if (!isInitialized) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let lastNewAt = Date.now()

    const tick = async () => {
      if (stopped) return
      if (document.visibilityState === 'visible') {
        const before = lastIdRef.current
        await fetchMessages()
        if (lastIdRef.current > before) lastNewAt = Date.now()
      }
      if (stopped) return
      const idle = Date.now() - lastNewAt > MESSAGE_TIMING.POLL_IDLE_AFTER
      timer = setTimeout(tick, idle ? MESSAGE_TIMING.POLL_INTERVAL_IDLE : MESSAGE_TIMING.POLL_INTERVAL)
    }

    // Вкладку снова открыли — сразу проверяем, не дожидаясь таймера
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (timer) clearTimeout(timer)
      tick()
    }

    timer = setTimeout(tick, MESSAGE_TIMING.POLL_INTERVAL)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isInitialized, fetchMessages])

  // Тестовые данные, если на сервере ничего нет
  useEffect(() => {
    if (isInitialized && schedule.length === 0 && testMessages && testMessages.length > 0) {
      setSchedule(testMessages.map((text, i) => ({ id: `test-${i}`, text, duration: normalizeDuration(4) })))
    }
  }, [isInitialized, schedule.length, testMessages])

  // Старт показа, как только есть что показывать
  useEffect(() => {
    if (isInitialized && schedule.length > 0) startScheduler()
  }, [isInitialized, schedule, startScheduler])

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
