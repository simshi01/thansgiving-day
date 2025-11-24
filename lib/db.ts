import { Pool } from 'pg'

// Создаем connection pool для эффективной работы с БД
let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set')
    }

    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  }

  return pool
}

// Интерфейс для сообщения
export interface Message {
  id: string
  text: string
  createdAt: Date
  isActive: boolean
  positionX: number | null
  positionY: number | null
  duration: number | null
}

// Создание таблицы (миграция)
export async function createMessagesTable(): Promise<void> {
  const db = getPool()
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      text TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      is_active BOOLEAN DEFAULT true,
      position_x INTEGER,
      position_y INTEGER,
      duration REAL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_active ON messages(is_active) WHERE is_active = true;
  `)
}

// Добавление нового сообщения
export async function addMessage(
  text: string,
  positionX: number,
  positionY: number,
  duration: number
): Promise<Message> {
  const db = getPool()
  
  const result = await db.query<Message>(
    `INSERT INTO messages (text, position_x, position_y, duration)
     VALUES ($1, $2, $3, $4)
     RETURNING id, text, created_at as "createdAt", is_active as "isActive", 
               position_x as "positionX", position_y as "positionY", duration`,
    [text, positionX, positionY, duration]
  )

  return {
    id: result.rows[0].id,
    text: result.rows[0].text,
    createdAt: result.rows[0].createdAt,
    isActive: result.rows[0].isActive,
    positionX: result.rows[0].positionX,
    positionY: result.rows[0].positionY,
    duration: result.rows[0].duration,
  }
}

// Получение последних сообщений
export async function getRecentMessages(limit: number = 100): Promise<Message[]> {
  const db = getPool()
  
  const result = await db.query<Message>(
    `SELECT id, text, created_at as "createdAt", is_active as "isActive",
            position_x as "positionX", position_y as "positionY", duration
     FROM messages
     WHERE is_active = true
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  )

  return result.rows.map(row => ({
    id: row.id,
    text: row.text,
    createdAt: row.createdAt,
    isActive: row.isActive,
    positionX: row.positionX,
    positionY: row.positionY,
    duration: row.duration,
  }))
}

// Получение активных сообщений (которые сейчас показываются)
export async function getActiveMessages(): Promise<Message[]> {
  const db = getPool()
  
  // Получаем сообщения за последние 30 секунд (активные)
  const result = await db.query<Message>(
    `SELECT id, text, created_at as "createdAt", is_active as "isActive",
            position_x as "positionX", position_y as "positionY", duration
     FROM messages
     WHERE is_active = true
       AND created_at > NOW() - INTERVAL '30 seconds'
     ORDER BY created_at DESC`
  )

  return result.rows.map(row => ({
    id: row.id,
    text: row.text,
    createdAt: row.createdAt,
    isActive: row.isActive,
    positionX: row.positionX,
    positionY: row.positionY,
    duration: row.duration,
  }))
}

// Деактивация старых сообщений (опционально, для очистки)
export async function deactivateOldMessages(): Promise<void> {
  const db = getPool()
  
  await db.query(
    `UPDATE messages
     SET is_active = false
     WHERE is_active = true
       AND created_at < NOW() - INTERVAL '1 hour'`
  )
}

