'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import MessageBubble from './MessageBubble'
import { normalizeDuration, MESSAGE_DURATION, MESSAGE_TIMING } from '@/lib/constants'
import { getBubbleMetrics, isTouchDevice, estimateBubbleSize } from '@/lib/bubble-metrics'

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

interface Rect {
  x: number
  y: number
  w: number
  h: number
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
  const [maxConcurrentMessages, setMaxConcurrentMessages] = useState<number>(4) // уточняется по размеру экрана

  const currentMessageIndexRef = useRef(0) // индекс следующего сообщения в цикле
  const isSchedulerRunningRef = useRef(false)
  const lastIdRef = useRef(0) // курсор опроса: самый большой id, который уже получили

  // Актуальные значения для колбэков опроса
  const scheduleRef = useRef(schedule)
  const maxConcurrentRef = useRef(maxConcurrentMessages)
  const dimensionsRef = useRef(dimensions)
  const isMobileRef = useRef(isMobile)
  useEffect(() => { scheduleRef.current = schedule }, [schedule])
  useEffect(() => { maxConcurrentRef.current = maxConcurrentMessages }, [maxConcurrentMessages])
  useEffect(() => { dimensionsRef.current = dimensions }, [dimensions])
  useEffect(() => { isMobileRef.current = isMobile }, [isMobile])

  // Размеры экрана и сколько сообщений показывать одновременно (lib/bubble-metrics.ts)
  useEffect(() => {
    const updateDimensions = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const metrics = getBubbleMetrics(width, height, isTouchDevice())
      setIsMobile(metrics.isMobile)
      setMaxConcurrentMessages(metrics.slots)
      setDimensions({ width, height })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Что сейчас на экране — обновляется сразу, без ожидания рендера.
  // Это единственный источник правды о занятых местах: id пузыря -> место и id сообщения.
  const placedRef = useRef(new Map<string, Rect & { scheduledId: string }>())
  // Какие сообщения этот экран уже показывал хотя бы раз
  const shownRef = useRef(new Set<string>())
  const initialLoadDoneRef = useRef(false)
  const pumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Места пузырей, которые ещё растворяются: место считается свободным для счёта,
  // но новый пузырь туда не ставим, пока старый не исчезнет совсем
  const fadingRef = useRef(new Map<string, Rect>())

  // Позиция без наложений: пробуем случайные места, берём первое свободное
  // (или с наименьшим перекрытием, если экран забит)
  const findPosition = useCallback((text: string) => {
    const { width, height } = dimensionsRef.current
    const size = estimateBubbleSize(text, getBubbleMetrics(width, height, isTouchDevice()))
    const padding = 40
    if (width === 0 || height === 0) return { x: 100, y: 100, ...size }
    const maxX = Math.max(1, width - size.w - padding * 2)
    const maxY = Math.max(1, height - size.h - padding * 2)
    const others: Rect[] = [...Array.from(placedRef.current.values()), ...Array.from(fadingRef.current.values())]
    let best = { x: padding, y: padding, overlap: Infinity }
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * maxX + padding
      const y = Math.random() * maxY + padding
      let overlap = 0
      for (const r of others) {
        const ox = Math.min(x + size.w, r.x + r.w) - Math.max(x, r.x)
        const oy = Math.min(y + size.h, r.y + r.h) - Math.max(y, r.y)
        if (ox > 0 && oy > 0) overlap += ox * oy
      }
      if (overlap < best.overlap) best = { x, y, overlap }
      if (overlap === 0) break
    }
    return { x: best.x, y: best.y, ...size }
  }, [])

  const onScreenIds = () => new Set(Array.from(placedRef.current.values()).map((p) => p.scheduledId))

  // Сколько новых сообщений ждут первого показа
  const freshBacklog = useCallback(() => {
    const onScreen = onScreenIds()
    return scheduleRef.current.filter((m) => !shownRef.current.has(m.id) && !onScreen.has(m.id)).length
  }, [])

  // Следующее сообщение: сначала новые (ещё ни разу не показанные, по порядку прихода),
  // потом старые по кругу. Только то, чего сейчас нет на экране.
  const nextToShow = useCallback((): ScheduledMessage | null => {
    const list = scheduleRef.current
    if (list.length === 0) return null
    const onScreen = onScreenIds()
    const fresh = list.find((m) => !shownRef.current.has(m.id) && !onScreen.has(m.id))
    if (fresh) return fresh
    for (let tries = 0; tries < list.length; tries++) {
      const m = list[currentMessageIndexRef.current % list.length]
      currentMessageIndexRef.current = (currentMessageIndexRef.current + 1) % list.length
      if (!onScreen.has(m.id)) return m
    }
    return null // всё уже на экране
  }, [])

  const showMessage = useCallback((m: ScheduledMessage) => {
    const pos = findPosition(m.text)
    const id = crypto.randomUUID()
    placedRef.current.set(id, { x: pos.x, y: pos.y, w: pos.w, h: pos.h, scheduledId: m.id })
    shownRef.current.add(m.id)
    // Есть очередь из новых — показываем короче, чтобы все успели появиться
    const duration = freshBacklog() > 0 ? Math.min(m.duration, MESSAGE_DURATION.BUSY) : m.duration
    setActiveMessages((prev) => [
      ...prev,
      { id, text: m.text, x: pos.x, y: pos.y, duration, scheduledId: m.id },
    ])
  }, [findPosition, freshBacklog])

  // «Насос»: заполняет свободные места по одному сообщению с небольшим интервалом,
  // чтобы пузыри появлялись не все разом. Единственное место, где сообщения выходят на экран.
  const pump = useCallback(() => {
    if (pumpTimerRef.current) return // уже работает
    const step = () => {
      pumpTimerRef.current = null
      if (placedRef.current.size >= maxConcurrentRef.current) return
      const m = nextToShow()
      if (!m) return
      showMessage(m)
      pumpTimerRef.current = setTimeout(step, MESSAGE_TIMING.PUMP_STEP)
    }
    step()
  }, [nextToShow, showMessage])

  // Сообщение исчезло — освобождаем место и подкачиваем следующее
  const handleMessageComplete = useCallback((id: string) => {
    const placed = placedRef.current.get(id)
    if (placed) {
      fadingRef.current.set(id, placed)
      setTimeout(() => fadingRef.current.delete(id), MESSAGE_TIMING.FADE_OUT_RESERVE)
    }
    placedRef.current.delete(id)
    setActiveMessages((prev) => prev.filter((msg) => msg.id !== id))
    pump()
  }, [pump])

  // Новые сообщения и удаления с сервера
  const applyServerData = useCallback((incoming: ApiMessage[], deleted: number[]) => {
    if (deleted.length > 0) {
      const del = new Set(deleted.map(String))
      if (scheduleRef.current.some((m) => del.has(m.id))) {
        scheduleRef.current = scheduleRef.current.filter((m) => !del.has(m.id))
        setSchedule(scheduleRef.current)
      }
      let removed = false
      Array.from(placedRef.current).forEach(([id, p]) => {
        if (del.has(p.scheduledId)) { placedRef.current.delete(id); removed = true }
      })
      if (removed) {
        setActiveMessages((prev) => prev.filter((m) => !del.has(m.scheduledId)))
        pump()
      }
    }

    const isInitialLoad = !initialLoadDoneRef.current
    initialLoadDoneRef.current = true

    const fresh = incoming.filter((m) => m.id > lastIdRef.current)
    if (fresh.length === 0) return
    lastIdRef.current = Math.max(lastIdRef.current, ...fresh.map((m) => m.id))
    const scheduled = fresh.map(toScheduled)
    // Всё, что было до открытия экрана, — «старое»: идёт по кругу и не задерживает новые
    if (isInitialLoad) scheduled.forEach((m) => shownRef.current.add(m.id))
    scheduleRef.current = [...scheduleRef.current, ...scheduled]
    setSchedule(scheduleRef.current)
    if (isSchedulerRunningRef.current) pump()
  }, [pump])

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

  // Старт показа, как только есть что показывать (дальше «насос» включают опрос и исчезновения)
  useEffect(() => {
    if (!isInitialized || schedule.length === 0) return
    isSchedulerRunningRef.current = true
    pump()
  }, [isInitialized, schedule, pump])

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
