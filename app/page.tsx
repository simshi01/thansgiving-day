'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const exampleTexts = ['За каждый день', 'За родителей', 'За Божью благодать']
const titleText = 'За что ты благодарен?'
const titleWords = titleText.split(' ')

export default function Home() {
  const [currentExample, setCurrentExample] = useState(0)
  const [displayedText, setDisplayedText] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const checkMobile = () => {
      const width = window.innerWidth
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      setIsMobile(width < 768 || (isTouchDevice && width < 1024))
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Ripple эффект для кнопки
  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      setRipple({ x, y })
      setTimeout(() => setRipple(null), 600)
    }
  }

  // Анимация печатной машинки
  useEffect(() => {
    if (!isFocused && inputValue === '') {
      const fullText = exampleTexts[currentExample]
      let timeout: NodeJS.Timeout

      if (!isDeleting && displayedText.length < fullText.length) {
        // Печатаем текст
        setIsTyping(true)
        timeout = setTimeout(() => {
          setDisplayedText((prev) => {
            const nextLength = prev.length + 1
            return fullText.slice(0, nextLength)
          })
        }, 100)
      } else if (!isDeleting && displayedText.length === fullText.length) {
        // Пауза после печати
        setIsTyping(false)
        timeout = setTimeout(() => {
          setIsDeleting(true)
        }, 2000)
      } else if (isDeleting && displayedText.length > 0) {
        // Удаляем текст
        timeout = setTimeout(() => {
          setDisplayedText((prev) => prev.slice(0, -1))
        }, 50)
      } else if (isDeleting && displayedText.length === 0) {
        // Переходим к следующему примеру
        setIsDeleting(false)
        setCurrentExample((prev) => (prev + 1) % exampleTexts.length)
      }

      return () => {
        if (timeout) clearTimeout(timeout)
      }
    } else {
      setDisplayedText('')
      setIsTyping(false)
      setIsDeleting(false)
    }
  }, [isFocused, inputValue, currentExample, displayedText, isDeleting, isTyping])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isSubmitting || isSuccess) return

    setIsSubmitting(true)
    setIsSuccess(false)
    setErrorMessage(null)

    try {
      // Генерируем случайные позиции для сообщения
      const positionX = Math.random() * (window.innerWidth - 300) + 50
      const positionY = Math.random() * (window.innerHeight - 200) + 50
      
      // Рассчитываем длительность показа
      const baseTime = 2
      const readingSpeed = 50
      const duration = Math.max(baseTime, Math.min(baseTime + inputValue.length / readingSpeed, 8))

      // Отправка на сервер
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: inputValue.trim(),
          positionX: Math.round(positionX),
          positionY: Math.round(positionY),
          duration,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при отправке сообщения')
      }

      setIsSubmitting(false)
      setIsSuccess(true)
      setErrorMessage(null)
      
      // Через 2 секунды сбрасываем состояние успеха
      setTimeout(() => {
        setIsSuccess(false)
        setInputValue('')
      }, 2000)
    } catch (error) {
      console.error('Error submitting message:', error)
      setIsSubmitting(false)
      const errorMsg = error instanceof Error ? error.message : 'Ошибка при отправке сообщения'
      setErrorMessage(errorMsg)
    }
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        padding: '20px',
        position: 'relative',
      }}
    >
      <motion.h1
        style={{
          fontSize: isMobile ? 'clamp(24px, 6vw, 32px)' : 'clamp(28px, 4vw, 48px)',
          fontWeight: '600',
          marginBottom: isMobile ? '24px' : '32px',
          textAlign: 'center',
          letterSpacing: '-0.02em',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
          padding: isMobile ? '0 16px' : '0',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '0.3em',
        }}
      >
        {titleWords.map((word, index) => (
          <motion.span
            key={index}
            initial={{
              opacity: 0,
              filter: 'blur(20px)',
              y: 10,
            }}
            animate={{
              opacity: 1,
              filter: 'blur(0px)',
              y: 0,
            }}
            transition={{
              duration: 0.8,
              delay: index * 0.1,
              ease: [0.4, 0, 0.2, 1],
            }}
            style={{
              display: 'inline-block',
            }}
          >
            {word}
          </motion.span>
        ))}
      </motion.h1>

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.4, 0, 0.2, 1] }}
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: isMobile ? '24px' : '24px',
          width: '100%',
          maxWidth: isMobile ? '100%' : '560px',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <motion.input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value)
                // Сбрасываем ошибку при изменении текста
                if (errorMessage) {
                  setErrorMessage(null)
                }
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              initial={false}
              animate={{
                backgroundColor: isFocused ? '#1C1C1E' : '#1C1C1E',
                borderColor: errorMessage 
                  ? '#FF3B30' 
                  : isFocused 
                    ? 'rgba(255, 255, 255, 0.5)' 
                    : 'rgba(255, 255, 255, 0.12)',
                boxShadow: errorMessage
                  ? '0 0 0 4px rgba(255, 59, 48, 0.15), 0 0 20px rgba(255, 59, 48, 0.1)'
                  : isFocused 
                    ? '0 0 0 4px rgba(255, 255, 255, 0.08), 0 0 20px rgba(255, 255, 255, 0.1)' 
                    : '0 2px 8px rgba(0, 0, 0, 0.2)',
                scale: isFocused ? 1.01 : 1,
              }}
              transition={{ 
                duration: 0.4, 
                ease: [0.4, 0, 0.2, 1],
                boxShadow: { duration: 0.3 },
                borderColor: { duration: 0.3 },
              }}
              style={{
                width: '100%',
                padding: isMobile ? '14px 20px' : '16px 26px',
                backgroundColor: '#1C1C1E',
                border: errorMessage 
                  ? '2px solid #FF3B30' 
                  : '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: isMobile ? '16px' : '18px',
                color: 'white',
                fontSize: isMobile ? '16px' : '17px',
                fontWeight: '400',
                lineHeight: '1.4',
                height: isMobile ? '48px' : '52px',
                outline: 'none',
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
              }}
            />
            {!isFocused && inputValue === '' && (
              <motion.div
                animate={{
                  opacity: isFocused ? 0 : 1,
                }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                style={{
                  position: 'absolute',
                  left: isMobile ? '20px' : '26px',
                  top: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  pointerEvents: 'none',
                  color: 'rgba(255, 255, 255, 0.5)',
                  fontSize: isMobile ? '16px' : '17px',
                  fontWeight: '400',
                  lineHeight: '1.4',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                }}
              >
                {displayedText}
                {isTyping && (
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
                    style={{ marginLeft: '2px' }}
                  >
                    |
                  </motion.span>
                )}
              </motion.div>
            )}
          </div>
          
          {/* Сообщение об ошибке - зарезервировано место чтобы ничего не ехало */}
          <div
            style={{
              width: '100%',
              minHeight: errorMessage ? '24px' : '0px',
              transition: 'min-height 0.3s ease',
            }}
          >
            <AnimatePresence>
              {errorMessage && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  style={{
                    margin: 0,
                    paddingLeft: isMobile ? '20px' : '26px',
                    paddingRight: isMobile ? '20px' : '26px',
                    fontSize: isMobile ? '13px' : '14px',
                    color: '#FF3B30',
                    lineHeight: '1.4',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                    fontWeight: '400',
                  }}
                >
                  {errorMessage}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
          style={{
            marginBottom: '0',
            fontSize: isMobile ? '13px' : '14px',
            color: 'rgba(255, 255, 255, 0.5)',
            textAlign: 'center',
            lineHeight: '1.4',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
            fontWeight: '400',
            maxWidth: isMobile ? '100%' : '560px',
            padding: isMobile ? '0 20px' : '0',
          }}
        >
          Постарайся написать коротко, но можешь<br />отправить много разных благодарностей!
        </motion.p>

        <motion.button
          ref={buttonRef}
          type="submit"
          disabled={isSubmitting || !inputValue.trim() || isSuccess}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ 
            opacity: 1, 
            scale: isSubmitting ? [1, 1.05, 1] : 1,
            backgroundColor: isSuccess ? '#34C759' : isSubmitting ? '#E5E5E5' : '#FFFFFF',
            color: isSuccess ? '#FFFFFF' : '#000000',
          }}
          transition={{ 
            duration: 0.4, 
            delay: 0.4, 
            ease: [0.4, 0, 0.2, 1],
            scale: isSubmitting ? {
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            } : undefined,
            backgroundColor: { duration: 0.3 },
            color: { duration: 0.3 },
          }}
          whileHover={!isSubmitting && !isSuccess ? { 
            scale: 1.02, 
            backgroundColor: '#F5F5F7', 
            boxShadow: '0 4px 16px rgba(255, 255, 255, 0.15)' 
          } : {}}
          whileTap={!isSubmitting && !isSuccess ? { scale: 0.98 } : {}}
          onClick={handleButtonClick}
          style={{
            position: 'relative',
            padding: isMobile ? '14px 32px' : '16px 40px',
            backgroundColor: isSuccess ? '#34C759' : isSubmitting ? '#E5E5E5' : '#FFFFFF',
            color: isSuccess ? '#FFFFFF' : '#000000',
            border: 'none',
            borderRadius: isMobile ? '12px' : '14px',
            fontSize: isMobile ? '16px' : '17px',
            fontWeight: '700',
            lineHeight: '1.4',
            height: isMobile ? '48px' : '52px',
            cursor: isSubmitting || isSuccess ? 'not-allowed' : 'pointer',
            minWidth: isMobile ? '160px' : '200px',
            width: isMobile ? '100%' : 'auto',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
            boxShadow: isSuccess ? '0 2px 12px rgba(52, 199, 89, 0.3)' : '0 2px 12px rgba(255, 255, 255, 0.1)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isSubmitting ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  ease: 'linear',
                }}
                style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(0, 0, 0, 0.2)',
                  borderTopColor: '#000000',
                  borderRadius: '50%',
                }}
              />
              <span>Отправка</span>
            </motion.div>
          ) : isSuccess ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <motion.svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <motion.path
                  d="M3 8 L6 11 L13 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
                />
              </motion.svg>
              <span>Успешно</span>
            </motion.div>
          ) : (
            'Благодарить'
          )}
          
          {/* Ripple эффект */}
          {ripple && (
            <motion.span
              initial={{
                scale: 0,
                opacity: 0.6,
                x: ripple.x,
                y: ripple.y,
              }}
              animate={{
                scale: 4,
                opacity: 0,
              }}
              transition={{
                duration: 0.6,
                ease: 'easeOut',
              }}
              style={{
                position: 'absolute',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'rgba(0, 0, 0, 0.2)',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            />
          )}
        </motion.button>
      </motion.form>
    </div>
  )
}
