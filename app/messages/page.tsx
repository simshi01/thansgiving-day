'use client'

import MessageContainer from '@/components/MessageContainer'

export default function MessagesPage() {
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
      <MessageContainer />
    </div>
  )
}
