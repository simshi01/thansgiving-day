import { Server as SocketIOServer } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { addMessage, getActiveMessages, deleteMessage } from './db'
import { validateMessage } from './moderation'

let io: SocketIOServer | null = null

export function initializeSocketServer(server: HTTPServer) {
  if (io) {
    return io
  }

  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NEXT_PUBLIC_SOCKET_URL || '*',
      methods: ['GET', 'POST'],
    },
    path: '/api/socket',
  })

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id)

    // Отправка активных сообщений новому клиенту
    socket.on('sync:request', async () => {
      try {
        const activeMessages = await getActiveMessages()
        socket.emit('sync:response', {
          messages: activeMessages.map(msg => ({
            id: msg.id,
            text: msg.text,
            positionX: msg.positionX,
            positionY: msg.positionY,
            duration: msg.duration,
          })),
        })
      } catch (error) {
        console.error('Error syncing messages:', error)
        // Возвращаем пустой массив вместо ошибки, чтобы клиент мог работать
        socket.emit('sync:response', { messages: [] })
      }
    })

    // Обработка нового сообщения
    socket.on('message:new', async (data) => {
      try {
        const { text, positionX, positionY, duration } = data

        // Валидация
        const validation = validateMessage(text)
        if (!validation.isValid) {
          socket.emit('message:error', { error: validation.reason })
          return
        }

        // Сохранение в БД
        const message = await addMessage(
          text.trim(),
          positionX,
          positionY,
          duration || 5
        )

        // Отправка всем подключенным клиентам
        io!.emit('message:new', {
          id: message.id,
          text: message.text,
          positionX: message.positionX,
          positionY: message.positionY,
          duration: message.duration,
        })
      } catch (error) {
        console.error('Error handling new message:', error)
        socket.emit('message:error', { error: 'Ошибка при отправке сообщения' })
      }
    })

    // Обработка удаления сообщения
    socket.on('message:delete', async (data) => {
      try {
        const { id } = data

        if (!id || typeof id !== 'string') {
          socket.emit('message:error', { error: 'ID сообщения обязателен' })
          return
        }

        // Удаление из БД
        const deleted = await deleteMessage(id)

        if (!deleted) {
          socket.emit('message:error', { error: 'Сообщение не найдено' })
          return
        }

        // Отправка события удаления всем подключенным клиентам
        io!.emit('message:deleted', { id })
      } catch (error) {
        console.error('Error deleting message:', error)
        socket.emit('message:error', { error: 'Ошибка при удалении сообщения' })
      }
    })

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
    })
  })

  return io
}

export function getSocketServer(): SocketIOServer | null {
  return io
}

