// Модерация коротких сообщений-благодарностей (русский + английский).
//
// Конвейер:
//   1. Предобработка: NFKC, удаление невидимых/комбинирующих символов.
//   2. Токенизация. Одиночные буквы, разделённые пробелами/точками/дефисами
//      ("с у к а", "п.и.з.д.е.ц", "с-у-к-а"), склеиваются в один токен
//      (это и есть "сжатый" проход: он работает только внутри серий одиночных
//      букв, поэтому не создаёт ложных срабатываний на стыках обычных слов).
//   3. Нормализация каждого токена: lowercase, ё->е, латиница/цифры/символы ->
//      кириллица (xyй, cyka, п1здец, п@здец), схлопывание повторов (хууууй).
//      Маска "*" разворачивается во все гласные (х*й, бл*дь).
//   4. Проверка корневыми регулярками (с допустимыми приставками для мата) и
//      явным списком безопасных основ для "широких" корней (мудр, сукн, ...).
//   5. Английский: отдельная нормализация (цифры/символы -> латиница) и свой список.
//
// Религиозная лексика (смерть, умер, кровь, ад, грех, сатана, крест) не блокируется.

const ERROR_TEXT = 'Текст содержит недопустимые слова'

// ---------- Нормализация ----------

const INVISIBLE_RE = /[­͏؜ᅟᅠ឴឵᠋-᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g
const MARKS_RE = /[\u0300-\u036F\u0483-\u0489\u20D0-\u20FF]/g
const CYR_RE = /[Ѐ-ӿ]/
const LETTER_RE = /[A-Za-z\u00C0-\u024F\u0400-\u04FF]/

// Латинские двойники -> кириллица
const LAT_TO_CYR: Record<string, string> = {
  a: 'а', b: 'б', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т',
  x: 'х', y: 'у', z: 'з', i: 'и', n: 'п', u: 'и', r: 'г', d: 'д', l: 'л', g: 'д', v: 'в',
}
// Цифры и символы -> кириллица
const SYM_TO_CYR: Record<string, string> = {
  '0': 'о', '1': 'и', '3': 'з', '4': 'а', '6': 'б', '8': 'в', '$': 'с', // '@' - маска, как '*'
}
// Цифры и символы -> латиница (для английского)
const SYM_TO_LAT: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '$': 's',
}

const CYR_VOWELS = ['а', 'е', 'и', 'о', 'у', 'ы', 'э', 'ю', 'я']
const LAT_VOWELS = ['a', 'e', 'i', 'o', 'u']

function collapseRepeats(s: string): string {
  return s.replace(/(.)\1+/g, '$1')
}

function basicClean(text: string): string {
  return text.normalize('NFKC').replace(INVISIBLE_RE, '').replace(MARKS_RE, '').toLowerCase().replace(/ё/g, 'е')
}

function toCyr(token: string): string {
  let out = ''
  for (let i = 0; i < token.length; i++) {
    const ch = token.charAt(i)
    out += LAT_TO_CYR[ch] ?? SYM_TO_CYR[ch] ?? ch
  }
  return collapseRepeats(out)
}

function toLat(token: string): string {
  let out = ''
  for (let i = 0; i < token.length; i++) {
    const ch = token.charAt(i)
    out += SYM_TO_LAT[ch] ?? ch
  }
  return collapseRepeats(out)
}

// ---------- Токенизация ----------

const DOTTED_RE = /^(?:[0-9A-Za-z\u00C0-\u024F\u0400-\u04FF@$][.\-_·]){2,}[0-9A-Za-z\u00C0-\u024F\u0400-\u04FF@$][.,!?;:…]*$/
const SPLIT_RE = /[^0-9A-Za-z\u00C0-\u024F\u0400-\u04FF@$*]+/

function tokenize(text: string): string[] {
  const cleaned = basicClean(text)
  const raw = cleaned.split(/\s+/).filter(Boolean)
  const tokens: string[] = []
  let run: string[] = [] // серия одиночных букв

  const flushRun = () => {
    if (run.length >= 3) {
      tokens.push(run.join(''))
    } else {
      tokens.push(...run)
    }
    run = []
  }

  for (const r of raw) {
    if (DOTTED_RE.test(r)) {
      flushRun()
      tokens.push(r.replace(/[^0-9A-Za-z\u00C0-\u024F\u0400-\u04FF@$]/g, ''))
      continue
    }
    const parts = r.split(SPLIT_RE).filter(Boolean)
    // Одиночный символ (буква/цифра/@/$) как отдельное "слово" -> кандидат в серию
    if (parts.length === 1 && parts[0].length === 1 && parts[0] !== '*' && /[@$A-Za-z\u00C0-\u024F\u0400-\u04FF]/.test(parts[0])) {
      run.push(parts[0])
      continue
    }
    flushRun()
    for (const p of parts) tokens.push(p)
  }
  flushRun()
  return tokens.filter(t => LETTER_RE.test(t))
}

// ---------- Русские корни ----------

// Приставки, допустимые перед матерными корнями.
const PFX = '(?:вы|за|до|на|по|от|у|раз|рас|разъ|съ|при|про|под|подъ|пере|об|объ|вз|недо|долбо|долба|мудо|пиздо|хуе|въ|взъ)?'

interface Detector {
  re: RegExp
  /** широкий корень: подчиняется списку безопасных основ */
  loose?: boolean
}

const rx = (src: string): RegExp => new RegExp(src)

// Срабатывают в любой позиции токена (однозначные корни; ловят и склейки типа "спасибохуй")
const ANYWHERE: RegExp[] = [
  rx('ху[йеяи]'), // хуй, хуе(в/ё/сос/та/во), хуя(к), хуи
  rx('пизд'), // пизда, пиздец, пиздеть, распиздяй, опиздел, пиздёж
  rx('пзд[цкат]'), // пздц
  rx('еблан'),
  rx('ублюд'),
  rx('долб[ао](?:еб|ящ)'),
  rx('заеб|наеб|выеб|доеб|отъеб|объеб'), // приставочные формы в склейках
]

// Только с начала токена (с допустимыми приставками)
const ANCHORED: Detector[] = [
  // ебать и производные
  { re: rx(`^${PFX}еб(?:а[нтлшсцчй]|у[чнй]|л|и(?:сь|ть|тесь)|ы[вр]|ок|ну|ет$|ешь$|ут$|а$|у$|и$|ы$|$)`) },
  { re: rx('^гребан') },
  // бля
  { re: rx(`^${PFX}бля(?:$|д|т|х|ц|з|н$)`) },
  { re: rx('^бл[еэ]т') },
  // сука, сучара
  { re: rx('^сцу(?:к|ч)|^су(?:к|ч)'), loose: true },
  // мудак, мудила, мудозвон
  { re: rx('^муд(?!р)'), loose: true },
  // залупа
  { re: rx('^залуп') },
  // гандон
  { re: rx('^г[ао]ндон') },
  // шлюха
  { re: rx('^шлю[хш]') },
  // пидор
  { re: rx('^пид(?:ор|ар|р)') },
  // дрочить
  { re: rx('^дроч'), loose: true },
  // манда
  { re: rx('^манд(?:а|у|ой|ы|е|ав)'), loose: true },
  // нахер, похер
  { re: rx('^(?:на|по)хер') },
  { re: rx('^нах$|^пох$') },
  { re: rx('^ип(?:ать|ат|ал|ан|ну|у)$|^(?:вы|за|до|на|по|от|у|раз|рас|съ|при|про|под|пере|об)ип(?:ать|ал|ан)') },
  // жопа, говно, дерьмо, срать
  { re: rx('^жоп') },
  { re: rx('^г[ао]вн') },
  { re: rx('^дерьм') },
  { re: rx('^(?:на|по|вы|за)?срат') },
  { re: rx('^(?:на|по|вы|за)?сран') },
  { re: rx('^засранц') },
  // хер, херня (но не херувим)
  { re: rx('^хер(?:$|ня|ню|ни|ней|ов|ом|у$|а$|ам|ак|овин)') },
  // оскорбления
  { re: rx('^дебил') },
  { re: rx('^идиот') },
  { re: rx('^кретин') },
  { re: rx('^придур(?:ок|к|оч)') },
  { re: rx('^урод(?:$|ы$|ов$|ам$|ами$|а$|у$|е$|ом$|ин|ка$|ки$|ку$|ке$|ой$|ливый$|ство$)') },
  { re: rx('^тварин|^твары$') },
  { re: rx('^мраз(?:ь|от|и$)') },
  { re: rx('^туп(?:ой|ая|ое|ые|ую|ого|ому|ым|ых|ою|иц|орыл|оголов|ость$|ак$|ари?$|ень$)') },
  { re: rx('^дур(?:а|ы|е|у|ой)$|^дурак|^дурач|^дурацк|^дурень$') },
  { re: rx('^козлин|^козлов(?:$)') },
  { re: rx('^сволоч|^сволот') },
  { re: rx('^подонк|^подонок') },
  { re: rx('^гадин(?:а|ы|е|у|ой)$|^гад$') },
  { re: rx('^паскуд|^падла$|^падлы$|^гнида$|^выродок$|^выродк') },
  { re: rx('^чмо(?:$|ня|шник|шка)') },
  { re: rx('^лох(?:$|и$|ов$|ам$|ом$|а$|у$|ушка$|ня$|анутый$)') },
  { re: rx('^сукин') },
]

// Слова, которые блокируются только как оскорбление (по контексту соседних слов)
const KOZEL_RE = rx('^козел$|^козлы$|^козла$')
const KOZEL_SAFE_NEIGHBORS = new Set(['отпущения', 'отпущенья', 'молоко', 'молока', 'молоком', 'стадо', 'пасут', 'пасет'])
const SKOTINA_RE = rx('^скотин(?:а|ы|е|у|ой)$')
const SKOTINA_SAFE_NEIGHBORS = new Set([
  'наша', 'нашу', 'нашей', 'нашем', 'моя', 'мою', 'моей', 'свою', 'своей', 'домашняя', 'домашнюю', 'домашней',
  'всю', 'всей', 'нашу', 'корм', 'корма', 'кормить', 'кормил', 'накормить', 'накормил', 'скот', 'скота', 'пасти', 'хлев', 'хлеву',
])

// Безопасные основы (в нормализованном виде), для которых широкие корни не применяются.
const ALLOWED_STEMS_RAW = [
  'мудр', 'мудрец', 'мудрост', 'премудр',
  'сукн', 'сукон', 'суков', 'сукров', 'сукцес', 'сучок', 'сучк_', 'сучь', 'сучьев',
  'мандарин', 'мандат', 'мандол', 'мандраж', 'мандраг', 'мандал',
  'дрочен',
  // слова-ловушки (не содержат матерных корней, но перечислены для надёжности)
  'хлеб', 'неб', 'ребен', 'ребят', 'треб', 'употреб', 'оскорб', 'страх', 'психо', 'гребл', 'греб_', 'скреб',
  'рубл', 'корабл', 'команд', 'сабл', 'учеб', 'погреб', 'истреб', 'колеб', 'лебед',
]
const ALLOWED_STEMS = ALLOWED_STEMS_RAW
  .filter(s => !s.endsWith('_'))
  .map(s => collapseRepeats(s))

function isAllowedStem(token: string): boolean {
  for (const stem of ALLOWED_STEMS) {
    if (token.startsWith(stem)) return true
  }
  return false
}

// Приставки-"склейки" благодарности (спасибосука, благодарюсука)
const GLUE_PREFIX_RE = /^(?:спасибо|благодарю|благодарен|благодарна|за)(?=.{3,})/

function matchesRu(token: string): boolean {
  for (const re of ANYWHERE) {
    if (re.test(token)) return true
  }
  const allowed = isAllowedStem(token)
  for (const d of ANCHORED) {
    if (d.loose && allowed) continue
    if (d.re.test(token)) return true
  }
  return false
}

// ---------- Английский ----------

const EN_PATTERNS: RegExp[] = [
  /fuck|fuk(?:er|ing|ed|s)?$|^fck|^fuc?k/,
  /shit/,
  /bitch/,
  /ashole|^asholes?$/,
  /^dicks?$|^dickhead|^dik$/,
  /^cunts?|^cnt$/,
  /^stfu$|^wtf$/,
  /^whores?$|^sluts?$|^bastards?$|^wankers?$|^twats?$|^prick$|^pricks$/,
  /^pusy$|^pusies$/,
  /^cocks?$|^cocksucker/,
  /^pis(?:s|ed|ing)?$|^pised|^pisof/,
  /^nig(?:er|a)s?$/,
  /^fagot|^fags?$/,
  /^motherfuk|^mothrfuk/,
  /^blyat|^blyad|^blya$|^suka$|^suki$|^pizd|^pidor|^pidar|^mudak|^ebat|^ebal|^ebany|^dolboeb|^gandon|^zalup|^xuy|^huy|^nahuy|^nahui/,
]
const EN_SAFE = new Set(['shitake', 'shiitake', 'shitake', 'scunthorpe', 'pissarro'])

function matchesEn(token: string): boolean {
  if (EN_SAFE.has(token)) return false
  for (const re of EN_PATTERNS) {
    if (re.test(token)) return true
  }
  return false
}

// ---------- Проверка токена ----------

function variantsWithMask(s: string, vowels: string[]): string[] {
  if (!/[*@]/.test(s)) return [s]
  return vowels.map(v => s.replace(/[*@]/g, v))
}

function stripStars(s: string): string {
  return s.replace(/[*@]/g, '')
}

function tokenIsBad(token: string): boolean {
  const hasCyr = CYR_RE.test(token)

  // Русский путь (также ловит латинские двойники: cyka, xyй)
  const cyr = toCyr(token)
  const cyrVariants = variantsWithMask(cyr, CYR_VOWELS)
  for (const v of cyrVariants) {
    if (matchesRu(v)) return true
    // склейка: спасибосука, благодарюсука
    const m = GLUE_PREFIX_RE.exec(v)
    if (m && matchesRu(v.slice(m[0].length))) return true
  }
  // маска вместо буквы можно просто выбросить (ёб*ный -> ебный) - не используем:
  // гласные-подстановки покрывают реальные случаи.

  // Английский путь (только для токенов без кириллицы)
  if (!hasCyr) {
    const lat = toLat(token)
    for (const v of variantsWithMask(lat, LAT_VOWELS)) {
      if (matchesEn(v)) return true
    }
    // маска как пропуск буквы (f*ck -> fck, c*nt -> cnt)
    if (/[*@]/.test(token) && matchesEn(stripStars(lat))) return true
  }
  return false
}

const SKOTINA_CONTEXT_RE = rx('^(?:ферм|хлев|двор|сарай|пастбищ|доить|доил|корм)')
const TVAR_RE = rx('^тварь$')
const TVAR_PREV_RE = rx('^(?:всяк|кажд|вся$|все$|всю$)')

function hasNear(norm: string[], i: number, dist: number, re: RegExp): boolean {
  for (let j = Math.max(0, i - dist); j <= Math.min(norm.length - 1, i + dist); j++) {
    if (j !== i && re.test(norm[j])) return true
  }
  return false
}

function hasBad(tokens: string[]): boolean {
  const norm: string[] = tokens.map(t => toCyr(t).replace(/[*@]/g, ''))
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (tokenIsBad(t)) return true

    const n = norm[i]
    if (KOZEL_RE.test(n)) {
      const prev = norm[i - 1]
      const next = norm[i + 1]
      if (!(prev && KOZEL_SAFE_NEIGHBORS.has(prev)) && !(next && KOZEL_SAFE_NEIGHBORS.has(next))) return true
    }
    if (SKOTINA_RE.test(n) && !hasNear(norm, i, 2, SKOTINA_CONTEXT_RE) && !(norm[i - 1] && SKOTINA_SAFE_NEIGHBORS.has(norm[i - 1])) && !(norm[i + 1] && SKOTINA_SAFE_NEIGHBORS.has(norm[i + 1]))) return true
    if (TVAR_RE.test(n)) {
      const prev = norm[i - 1]
      const next = norm[i + 1]
      if (!(prev && TVAR_PREV_RE.test(prev)) && !(next && /^божи/.test(next))) return true
    }
  }
  return false
}

// ---------- Публичный API ----------

// Функция проверки текста на наличие запрещенных слов
export function moderateText(text: string): { isValid: boolean; moderatedText?: string; reason?: string } {
  const tokens = tokenize(text.trim())
  if (hasBad(tokens)) {
    return { isValid: false, reason: ERROR_TEXT }
  }
  return { isValid: true, moderatedText: text }
}

// Валидация длины текста
export function validateTextLength(text: string, maxLength: number = 300): { isValid: boolean; reason?: string } {
  if (text.trim().length === 0) {
    return { isValid: false, reason: 'Текст не может быть пустым' }
  }

  if (text.length > maxLength) {
    return { isValid: false, reason: `Текст не может быть длиннее ${maxLength} символов` }
  }

  return { isValid: true }
}

// Полная валидация текста
export function validateMessage(text: string): { isValid: boolean; reason?: string } {
  // Проверка длины
  const lengthCheck = validateTextLength(text, 300)
  if (!lengthCheck.isValid) {
    return lengthCheck
  }

  // Модерация
  const moderationCheck = moderateText(text)
  if (!moderationCheck.isValid) {
    return moderationCheck
  }

  return { isValid: true }
}
