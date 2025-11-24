import { NextRequest, NextResponse } from 'next/server'
import { addMessage, getRecentMessages, createMessagesTable } from '@/lib/db'
import { validateMessage } from '@/lib/moderation'

// Инициализация таблицы при первом запросе
let tableInitialized = false

async function ensureTableExists() {
  if (!tableInitialized) {
    try {
      await createMessagesTable()
      tableInitialized = true
    } catch (error) {
      console.error('Error creating table:', error)
    }
  }
}

// POST /api/messages - Создание нового сообщения
export async function POST(request: NextRequest) {
  try {
    await ensureTableExists()

    const body = await request.json()
    const { text, positionX, positionY, duration } = body

    // Валидация входных данных
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Текст сообщения обязателен' },
        { status: 400 }
      )
    }

    if (typeof positionX !== 'number' || typeof positionY !== 'number') {
      return NextResponse.json(
        { error: 'Позиции X и Y обязательны' },
        { status: 400 }
      )
    }

    // Валидация и модерация текста
    const validation = validateMessage(text)
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.reason || 'Текст не прошел валидацию' },
        { status: 400 }
      )
    }

    // Сохранение сообщения в БД
    const message = await addMessage(
      text.trim(),
      positionX,
      positionY,
      duration || 5
    )

    return NextResponse.json(
      { 
        success: true, 
        message: {
          id: message.id,
          text: message.text,
          positionX: message.positionX,
          positionY: message.positionY,
          duration: message.duration,
        }
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating message:', error)
    return NextResponse.json(
      { error: 'Ошибка при создании сообщения' },
      { status: 500 }
    )
  }
}

// GET /api/messages - Получение последних сообщений
export async function GET(request: NextRequest) {
  try {
    await ensureTableExists()

    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    const messages = await getRecentMessages(limit)

    return NextResponse.json(
      { 
        success: true, 
        messages: messages.map(msg => ({
          id: msg.id,
          text: msg.text,
          positionX: msg.positionX,
          positionY: msg.positionY,
          duration: msg.duration,
          createdAt: msg.createdAt,
        }))
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json(
      { error: 'Ошибка при получении сообщений' },
      { status: 500 }
    )
  }
}

