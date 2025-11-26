import { NextRequest, NextResponse } from 'next/server'
import { getAllMessages } from '@/lib/db'

const MESSAGE_INTERVAL = 5000 // 5 секунд между сообщениями
const MESSAGE_DURATION = 4000 // 4 секунды показ сообщения

export async function GET(request: NextRequest) {
  try {
    const messages = await getAllMessages()

    if (!messages || messages.length === 0) {
      return NextResponse.json({
        schedule: [],
        totalMessages: 0,
        cycleDuration: 0,
        serverTime: Date.now(),
      })
    }

    // Создаем расписание: каждое сообщение показывается через равные интервалы
    const schedule = messages.map((message, index) => ({
      id: message.id,
      text: message.text,
      duration: MESSAGE_DURATION,
      showTime: index * MESSAGE_INTERVAL, // время показа относительно начала цикла
      position: index,
    }))

    const cycleDuration = messages.length * MESSAGE_INTERVAL

    return NextResponse.json({
      schedule,
      totalMessages: messages.length,
      cycleDuration,
      messageInterval: MESSAGE_INTERVAL,
      messageDuration: MESSAGE_DURATION,
      serverTime: Date.now(),
    })
  } catch (error) {
    console.error('Error fetching schedule:', error)
    return NextResponse.json(
      { error: 'Ошибка при получении расписания' },
      { status: 500 }
    )
  }
}
