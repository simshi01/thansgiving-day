'use client'

import { useState, useEffect } from 'react'
import MessageContainer from '@/components/MessageContainer'

export default function MessagesPage() {
  const [maxConcurrent, setMaxConcurrent] = useState(6)

  useEffect(() => {
    const updateMaxConcurrent = () => {
      const width = window.innerWidth
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isMobile = width < 768 || (isTouchDevice && width < 1024)
      setMaxConcurrent(isMobile ? 3 : 6)
    }

    updateMaxConcurrent()
    window.addEventListener('resize', updateMaxConcurrent)
    return () => window.removeEventListener('resize', updateMaxConcurrent)
  }, [])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000000',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <MessageContainer maxConcurrent={maxConcurrent} />
    </div>
  )
}
