// Custom server для Socket.io в Next.js
import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { initializeSocketServer } from './lib/socket-server'
import { initializeDatabase } from './lib/db'

// Railway обычно устанавливает NODE_ENV автоматически
// Используем значение по умолчанию 'production' если не установлено
const nodeEnv = process.env.NODE_ENV || 'production'
const dev = nodeEnv !== 'production'
const hostname = process.env.HOSTNAME || '0.0.0.0'
// Railway автоматически устанавливает PORT, используем его
const port = parseInt(process.env.PORT || '3000', 10)

console.log(`🚀 Starting server...`)
console.log(`   Port: ${port}`)
console.log(`   Hostname: ${hostname}`)
console.log(`   Environment: ${nodeEnv}`)
console.log(`   Dev mode: ${dev}`)
console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? 'set' : 'not set'}`)
console.log(`   NEXT_PUBLIC_SOCKET_URL: ${process.env.NEXT_PUBLIC_SOCKET_URL || 'not set'}`)

// В production Next.js не требует передачи port в конструктор
console.log('📦 Initializing Next.js...')
console.log(`   Working directory: ${process.cwd()}`)
console.log(`   Dev mode: ${dev}`)

const app = next({ 
  dev,
})
const handle = app.getRequestHandler()

console.log('⏳ Preparing Next.js app...')
console.log(`   Dir: ${process.cwd()}`)

// Добавляем таймаут для app.prepare() чтобы не зависать
const preparePromise = app.prepare()
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('Next.js prepare() timeout after 30 seconds')), 30000)
})

Promise.race([preparePromise, timeoutPromise])
  .then(async () => {
  console.log('✅ Next.js prepared successfully')
  
  // Инициализация БД в фоне (не блокируем старт сервера)
  initializeDatabase().then((dbInitialized) => {
    if (dbInitialized) {
      console.log('✅ Database ready')
    } else {
      console.warn('⚠️  Database not available, some features may not work')
    }
  }).catch((error) => {
    console.error('❌ Database initialization error:', error)
  })
  
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true)
      
      // Healthcheck endpoint для Railway - отвечаем сразу
      if (parsedUrl.pathname === '/health' || parsedUrl.pathname === '/api/health') {
        res.writeHead(200, { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        })
        res.end(JSON.stringify({ 
          status: 'ok', 
          timestamp: new Date().toISOString(),
          port: port,
          hostname: hostname
        }))
        return
      }
      
      // Обработка запросов через Next.js
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      if (!res.headersSent) {
        res.statusCode = 500
        res.end('internal server error')
      }
    }
  })
  
  // Добавляем обработчик ошибок для сервера
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} is already in use`)
    } else {
      console.error('❌ HTTP Server error:', err)
    }
    process.exit(1)
  })

  // Инициализация Socket.io
  try {
    initializeSocketServer(httpServer)
    console.log('Socket.io initialized successfully')
  } catch (error) {
    console.error('Error initializing Socket.io:', error)
    // Продолжаем работу даже если Socket.io не инициализировался
  }

  httpServer
    .once('error', (err) => {
      console.error('❌ Server error:', err)
      process.exit(1)
    })
    .listen(port, hostname, () => {
      console.log(`✅ Server listening on http://${hostname}:${port}`)
      console.log(`✅ Healthcheck: http://${hostname}:${port}/health`)
      console.log(`✅ Application ready!`)
    })
  })
  .catch((err) => {
    console.error('❌ Failed to start server:', err)
    console.error('Error details:', err instanceof Error ? err.stack : err)
    console.error('Error message:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  })

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error)
  process.exit(1)
})

