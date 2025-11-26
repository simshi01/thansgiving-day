import { NextRequest, NextResponse } from 'next/server'
import { addMessage, getRecentMessages, createMessagesTable, deleteMessage } from '@/lib/db'
import { validateMessage } from '@/lib/moderation'
import { getSocketServer } from '@/lib/socket-server'

// Инициализация таблицы при первом запросе
let tableInitialized = false
let tableInitializationInProgress = false

async function ensureTableExists() {
  if (tableInitialized) return
  
  if (tableInitializationInProgress) {
    // Ждем завершения инициализации
    await new Promise(resolve => setTimeout(resolve, 1000))
    return
  }

  tableInitializationInProgress = true
  try {
    await createMessagesTable()
    tableInitialized = true
    console.log('Database table initialized successfully')
  } catch (error) {
    console.error('Error creating table:', error)
    // Не бросаем ошибку дальше, чтобы API мог работать
  } finally {
    tableInitializationInProgress = false
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

    // Отправка события через Socket.io всем подключенным клиентам
    const io = getSocketServer()
    if (io) {
      io.emit('message:new', {
        id: message.id,
        text: message.text,
        duration: message.duration,
      })
    }

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

// DELETE /api/messages - Удаление сообщения
export async function DELETE(request: NextRequest) {
  try {
    await ensureTableExists()

    const searchParams = request.nextUrl.searchParams
    const messageId = searchParams.get('id')

    if (!messageId) {
      return NextResponse.json(
        { error: 'ID сообщения обязателен' },
        { status: 400 }
      )
    }

    // Удаление сообщения из БД
    const deleted = await deleteMessage(messageId)

    if (!deleted) {
      return NextResponse.json(
        { error: 'Сообщение не найдено или уже удалено' },
        { status: 404 }
      )
    }

    // Отправка события удаления через Socket.io всем подключенным клиентам
    const io = getSocketServer()
    if (io) {
      io.emit('message:deleted', { id: messageId })
    }

    return NextResponse.json(
      { 
        success: true,
        message: 'Сообщение удалено'
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error deleting message:', error)
    return NextResponse.json(
      { error: 'Ошибка при удалении сообщения' },
      { status: 500 }
    )
  }
}

