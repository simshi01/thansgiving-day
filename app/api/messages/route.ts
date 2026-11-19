import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getStore } from '@/lib/store'
import { validateMessage } from '@/lib/moderation'
import { checkSpam, recordAccepted, getClientIp, parseDeviceId } from '@/lib/anti-spam'
import { normalizeDuration } from '@/lib/constants'

// Всегда выполняем на сервере, без кеша: экран опрашивает этот адрес
export const dynamic = 'force-dynamic'

// POST /api/messages — новое сообщение
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })
    }
    const { text, duration, website } = body as Record<string, unknown>

    // Ловушка для ботов: люди скрытое поле не видят. Тихо делаем вид, что всё ок.
    if (typeof website === 'string' && website.trim() !== '') {
      return NextResponse.json({ success: true }, { status: 201 })
    }

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Текст сообщения обязателен' }, { status: 400 })
    }

    // Антиспам: лимиты, повторы одного человека, ссылки и контакты
    const ip = getClientIp(request.headers)
    const deviceId = parseDeviceId(request.headers.get('x-device-id'))
    const spam = await checkSpam({ text, deviceId, ip })
    if (!spam.ok) {
      if (spam.retryAfterSec !== undefined) {
        return NextResponse.json(
          { error: spam.reason },
          { status: 429, headers: { 'Retry-After': String(spam.retryAfterSec) } }
        )
      }
      return NextResponse.json({ error: spam.reason }, { status: 400 })
    }

    // Длина и фильтр мата
    const validation = validateMessage(text)
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.reason || 'Текст не прошел валидацию' },
        { status: 400 }
      )
    }

    const message = await getStore().addMessage(
      text.trim(),
      normalizeDuration(typeof duration === 'number' ? duration : undefined)
    )
    await recordAccepted({ text, deviceId, ip })

    return NextResponse.json({ success: true, message }, { status: 201 })
  } catch (error) {
    console.error('Error creating message:', error)
    return NextResponse.json({ error: 'Ошибка при создании сообщения' }, { status: 500 })
  }
}

// GET /api/messages?after=<id> — сообщения новее id (after=0 — все) и список удалённых.
// Экран вызывает это раз в несколько секунд: одна пара команд Redis на запрос.
export async function GET(request: NextRequest) {
  try {
    const afterRaw = Number(request.nextUrl.searchParams.get('after') ?? 0)
    const after = Number.isFinite(afterRaw) && afterRaw > 0 ? Math.floor(afterRaw) : 0
    const { messages, deleted } = await getStore().poll(after)
    return NextResponse.json(
      { success: true, messages, deleted },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json({ error: 'Ошибка при получении сообщений' }, { status: 500 })
  }
}

// Пароль удаления — переменная окружения ADMIN_KEY. Без неё удаление выключено.
function isAdmin(request: NextRequest): boolean {
  const expected = process.env.ADMIN_KEY
  const given = request.headers.get('x-admin-key')
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// DELETE /api/messages?id=<id> — удалить сообщение (нужен заголовок x-admin-key)
export async function DELETE(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }
    const id = Number(request.nextUrl.searchParams.get('id'))
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'ID сообщения обязателен' }, { status: 400 })
    }
    const deleted = await getStore().deleteMessage(id)
    if (!deleted) {
      return NextResponse.json({ error: 'Сообщение не найдено или уже удалено' }, { status: 404 })
    }
    return NextResponse.json({ success: true, message: 'Сообщение удалено' }, { status: 200 })
  } catch (error) {
    console.error('Error deleting message:', error)
    return NextResponse.json({ error: 'Ошибка при удалении сообщения' }, { status: 500 })
  }
}
