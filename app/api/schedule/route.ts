import { NextRequest, NextResponse } from 'next/server'
import { getAllMessages } from '@/lib/db'
import { MESSAGE_TIMING, MESSAGE_DURATION, normalizeDuration } from '@/lib/constants'

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
    const schedule = messages.map((message, index) => {
      // Нормализуем duration из БД (которая в секундах)
      const durationInSeconds = normalizeDuration(message.duration)
      // Конвертируем в миллисекунды для расписания
      const durationInMs = durationInSeconds * 1000

      return {
        id: message.id,
        text: message.text,
        duration: durationInMs,
        showTime: index * MESSAGE_TIMING.INTERVAL, // время показа относительно начала цикла
        position: index,
      }
    })

    const cycleDuration = messages.length * MESSAGE_TIMING.INTERVAL

    return NextResponse.json({
      schedule,
      totalMessages: messages.length,
      cycleDuration,
      messageInterval: MESSAGE_TIMING.INTERVAL,
      messageDuration: MESSAGE_DURATION.DEFAULT * 1000,
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
