// Custom server для Socket.io в Next.js
import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { initializeSocketServer } from './lib/socket-server'

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

// Важно: Railway автоматически устанавливает PORT, используем его
console.log(`Starting server on port ${port}`)

const app = next({ 
  dev, 
  hostname, 
  port,
})
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true)
      
      // Healthcheck endpoint для Railway
      if (parsedUrl.pathname === '/health' || parsedUrl.pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
        return
      }
      
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      if (!res.headersSent) {
        res.statusCode = 500
        res.end('internal server error')
      }
    }
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
      console.error('Server error:', err)
      process.exit(1)
    })
    .listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`)
      console.log(`> Environment: ${process.env.NODE_ENV || 'development'}`)
      console.log(`> Healthcheck available at http://${hostname}:${port}/health`)
    })
}).catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

