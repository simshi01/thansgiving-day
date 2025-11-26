'use client'

import { motion } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'

interface MessageBubbleProps {
  text: string
  x: number
  y: number
  duration: number
  onComplete: () => void
}

export default function MessageBubble({ text, x, y, duration, onComplete }: MessageBubbleProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [scale, setScale] = useState(1)
  const [blurAmount, setBlurAmount] = useState(40)
  const [offsetY, setOffsetY] = useState(25)

  // Используем ref для хранения onComplete, чтобы избежать пересоздания таймера
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    // Определение типа устройства и адаптация размеров
    const updateDeviceType = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isMobileDevice = width < 768 || (isTouchDevice && width < 1024)
      
      setIsMobile(isMobileDevice)
      
      if (isMobileDevice) {
        // Мобильные устройства - меньшие размеры
        setScale(1)
        setBlurAmount(30)
        setOffsetY(20)
      } else {
        // Десктоп - большие размеры
        const isLargeScreen = width >= 2000 || height >= 1000
        if (isLargeScreen) {
          // Для экрана 2970x1080 увеличиваем размеры
          const scaleFactor = Math.min(width / 1920, height / 1080)
          setScale(Math.max(1, Math.min(scaleFactor, 1.5)))
          setBlurAmount(60)
          setOffsetY(40)
        } else {
          setScale(1)
          setBlurAmount(40)
          setOffsetY(25)
        }
      }
    }

    updateDeviceType()
    window.addEventListener('resize', updateDeviceType)
    return () => window.removeEventListener('resize', updateDeviceType)
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

  // Адаптивные размеры для мобильных и десктопов
  let fontSize: number
  let maxWidth: number
  let padding: string
  let borderRadius: string

  if (isMobile) {
    // Мобильные устройства - уменьшены в 1.5 раза
    fontSize = 11
    maxWidth = 187
    padding = '7px 9px'
    borderRadius = '12px 12px 12px 0px'
  } else {
    // Десктоп - уменьшены в 2 раза
    fontSize = scale >= 1.3 ? 32 : scale >= 1.1 ? 25 : 18
    maxWidth = scale >= 1.3 ? 563 : scale >= 1.1 ? 450 : 315
    padding = scale >= 1.3 ? '27px 36px' : scale >= 1.1 ? '21px 27px' : '14px 18px'
    borderRadius = scale >= 1.3 ? '32px 32px 32px 0px' : scale >= 1.1 ? '25px 25px 25px 0px' : '21px 21px 21px 0px'
  }

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
          padding: padding,
          backgroundColor: '#007AFF',
          borderRadius: borderRadius,
          color: 'white',
          fontSize: `${fontSize}px`,
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

