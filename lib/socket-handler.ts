// Обработчик для Socket.io в Next.js
import { Server as SocketIOServer } from 'socket.io'
import { Server as HTTPServer } from 'http'

let io: SocketIOServer | null = null

export function initSocket(server: HTTPServer) {
  if (io) {
    return io
  }

  io = new SocketIOServer(server, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  })

  return io
}

export default function handler(req: any, res: any) {
  if (!res.socket.server.io) {
    const io = initSocket(res.socket.server)
    res.socket.server.io = io
  }
  res.end()
}

