// Расширенный список запрещенных слов на русском языке
const forbiddenWords = [
  // Матерные слова (основные) - строгая проверка
  'блять', 'блядь', 'бля', 'бляд', 'блят', 'блядский', 'блядская', 'блядское',
  'хуй', 'хуйня', 'хуе', 'хуё', 'хуев', 'хуевый', 'хуева', 'хуевое', 'хуйло',
  'пизда', 'пиздец', 'пизд', 'пиздюк', 'пиздюля', 'пиздатый', 'пиздатая',
  'ебан', 'ебать', 'ебал', 'ебат', 'ебану', 'ебануть', 'ебаный', 'ебаная', 'ебаное',
  'ебло', 'ебанько', 'ебу', 'ебаш', 'ебаный',
  'сука', 'суки', 'сучара', 'сучий', 'сукин', 'сукина',
  'мудак', 'мудачок', 'мудила', 'мудацкий',
  'гандон', 'гондон',
  'залупа', 'залуп',
  'дроч', 'дрочить', 'дрочил', 'дрочила',
  'шлюха', 'шлюх', 'шлюш',
  'блядина', 'бляди', 'блядство',
  
  // Плохие слова и оскорбления
  'жопа', 'жоп', 'жопка', 'жопный', 'жопой',
  'дурак', 'дура', 'дурачок', 'дурацкий', 'дурацкая',
  'идиот', 'идиотка', 'идиотский', 'идиотская',
  'тупой', 'тупая', 'тупость', 'тупой',
  'дебил', 'дебилка', 'дебильный', 'дебильная',
  'кретин', 'кретинка',
  'придурок', 'придурочный',
  'мразь', 'мразота',
  'гад', 'гадина', 'гадкий', 'гадкая',
  'сволочь', 'сволочи',
  'подонок', 'подонки',
  'ублюдок', 'ублюдки',
  'скотина', 'скотины',
  
  // Негативные слова, не подходящие для благодарностей
  'ненавижу', 'ненависть', 'ненавидеть',
  'убить', 'убийство', 'убийца',
  'смерть', 'умереть', 'умер',
  'гадость', 'гадкий',
]

// Разрешенные фразы и контексты (полные фразы, которые всегда разрешены)
const allowedPhrases = [
  'за маму', 'за маму', 'за маму', 'маме', 'мамой', 'матери', 'матерью',
  'за бога', 'за бога', 'богу', 'богом', 'боже', 'божья', 'божью', 'божьей',
  'за родителей', 'родителям', 'родителями', 'родителя',
  'за семью', 'семье', 'семьей',
  'за друзей', 'друзьям', 'друзьями', 'друга',
  'за жизнь', 'жизни', 'жизнью',
  'за любовь', 'любви', 'любовью',
  'благодар', 'благодарность', 'благодарить', 'благодарен', 'благодарна',
  'спасибо',
]

// Разрешенные слова (которые могут содержать части запрещенных слов)
const allowedWords = [
  'мама', 'маму', 'маме', 'мамой', 'матери', 'матерью', 'мамаша',
  'бог', 'бога', 'богу', 'богом', 'боже', 'божья', 'божью', 'божьей',
  'родители', 'родителям', 'родителями', 'родителя', 'родитель',
  'семья', 'семье', 'семьей',
  'друзья', 'друзьям', 'друзьями', 'друг', 'друга',
  'жизнь', 'жизни', 'жизнью',
  'любовь', 'любви', 'любовью',
]

// Транслитерация английских букв в русские (для обнаружения обходов)
function transliterateToRussian(text: string): string {
  const translitMap: { [key: string]: string } = {
    'a': 'а', 'b': 'б', 'c': 'с', 'd': 'д', 'e': 'е',
    'f': 'ф', 'g': 'г', 'h': 'х', 'i': 'и', 'j': 'ж',
    'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о',
    'p': 'п', 'q': 'к', 'r': 'р', 's': 'с', 't': 'т',
    'u': 'у', 'v': 'в', 'w': 'в', 'x': 'х', 'y': 'у',
    'z': 'з',
    // Многосимвольные комбинации
    'zh': 'ж', 'ch': 'ч', 'sh': 'ш', 'sch': 'щ',
    'yu': 'ю', 'ya': 'я', 'yo': 'ё',
  }
  
  let result = text.toLowerCase()
  
  // Сначала заменяем многосимвольные комбинации
  for (const [from, to] of Object.entries(translitMap)) {
    if (from.length > 1) {
      result = result.replace(new RegExp(from, 'gi'), to)
    }
  }
  
  // Затем одиночные буквы
  for (const [from, to] of Object.entries(translitMap)) {
    if (from.length === 1) {
      result = result.replace(new RegExp(from, 'gi'), to)
    }
  }
  
  return result
}

// Нормализация текста (удаление обходов)
function normalizeText(text: string): string {
  // Удаляем пробелы внутри слов (х у й -> хуй)
  let normalized = text.replace(/(\S)\s+(\S)/g, '$1$2')
  
  // Транслитерируем английские буквы в русские
  normalized = transliterateToRussian(normalized)
  
  // Заменяем обходы символов на обычные буквы
  const replacements: { [key: string]: string } = {
    '@': 'а', '4': 'а', '6': 'б', '3': 'з', '1': 'и', '0': 'о',
    '*': '', '_': '', '-': '', '.': '', '!': '', '?': '', '#': '',
  }
  
  normalized = normalized.toLowerCase()
  for (const [from, to] of Object.entries(replacements)) {
    normalized = normalized.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), to)
  }
  
  return normalized
}

// Токенизация текста (разбиение на слова с учетом границ)
function tokenizeText(text: string): string[] {
  // Нормализуем текст
  const normalized = normalizeText(text)
  
  // Убираем знаки препинания и разбиваем на слова
  const cleanText = normalized.replace(/[.,!?;:()\-_\[\]{}'"]/g, ' ')
  const words = cleanText.split(/\s+/).filter(word => word.length > 0)
  
  return words
}

// Проверка, является ли слово разрешенным или частью разрешенного слова
function isAllowedWord(word: string): boolean {
  // Точное совпадение с разрешенными словами
  for (const allowedWord of allowedWords) {
    if (word === allowedWord) {
      return true
    }
    // Если проверяемое слово является частью разрешенного (но не наоборот)
    // Например: "ма" является частью "мама" - разрешаем
    if (allowedWord.includes(word) && allowedWord.length > word.length) {
      return true
    }
  }
  return false
}

// Проверка, содержит ли текст разрешенную фразу
function containsAllowedPhrase(text: string): boolean {
  const lowerText = text.toLowerCase()
  for (const phrase of allowedPhrases) {
    if (lowerText.includes(phrase)) {
      return true
    }
  }
  return false
}

// Проверка контекста: есть ли запрещенное слово в тексте, но не в разрешенной фразе
function hasForbiddenWordInContext(text: string, words: string[]): boolean {
  const lowerText = text.toLowerCase()
  const normalizedText = normalizeText(text)
  const normalizedLower = normalizedText.toLowerCase()
  
  // Проверяем каждое запрещенное слово
  for (const forbiddenWord of forbiddenWords) {
    // Ищем запрещенное слово в нормализованном тексте
    const escapedWord = forbiddenWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const wordBoundaryRegex = new RegExp(`\\b${escapedWord}\\b`, 'i')
    
    if (wordBoundaryRegex.test(normalizedLower)) {
      // Проверяем что это не часть разрешенного слова
      if (isAllowedWord(forbiddenWord)) {
        continue
      }
      
      // Проверяем что это не часть разрешенной фразы
      let isInAllowedPhrase = false
      for (const phrase of allowedPhrases) {
        if (phrase.includes(forbiddenWord)) {
          isInAllowedPhrase = true
          break
        }
      }
      
      if (isInAllowedPhrase) {
        continue
      }
      
      // Проверяем контекст: если запрещенное слово является частью какого-то слова в тексте
      // Например: "блядская" содержит "бляд" - блокируем
      // Но "мама" содержит "ма" - это нормально (если "ма" не в списке запрещенных)
      let isPartOfAllowedWord = false
      for (const word of words) {
        // Если слово содержит запрещенное слово, но само является разрешенным
        if (word.includes(forbiddenWord) && isAllowedWord(word)) {
          isPartOfAllowedWord = true
          break
        }
      }
      
      // Если запрещенное слово есть, но не является частью разрешенного слова или фразы - блокируем
      if (!isPartOfAllowedWord) {
        return true
      }
    }
  }
  
  return false
}

// Функция проверки текста на наличие запрещенных слов
export function moderateText(text: string): { isValid: boolean; moderatedText?: string; reason?: string } {
  const originalText = text.trim()
  const lowerText = originalText.toLowerCase()
  
  // Проверяем разрешенные фразы сначала
  const hasAllowedPhrase = containsAllowedPhrase(lowerText)
  
  // Нормализуем текст для проверки обходов (включая транслитерацию)
  const normalizedText = normalizeText(originalText)
  const normalizedLower = normalizedText.toLowerCase()
  
  // Токенизируем текст (разбиваем на слова)
  const words = tokenizeText(originalText)
  
  // Проверка контекста: если есть запрещенное слово рядом с разрешенным, но не в разрешенной фразе
  if (hasForbiddenWordInContext(originalText, words)) {
    return { 
      isValid: false, 
      reason: `Текст содержит недопустимые слова` 
    }
  }
  
  // Проверяем каждое слово на точное совпадение с запрещенными
  for (const word of words) {
    // Пропускаем очень короткие слова
    if (word.length < 2) continue
    
    // Проверяем точное совпадение с запрещенными словами
    for (const forbiddenWord of forbiddenWords) {
      // Точное совпадение слова
      if (word === forbiddenWord) {
        // Если это разрешенное слово, пропускаем
        if (isAllowedWord(word)) {
          continue
        }
        
        // Если есть разрешенная фраза, проверяем контекст
        if (hasAllowedPhrase) {
          // Проверяем что запрещенное слово не является частью разрешенной фразы
          let isInAllowedPhrase = false
          for (const phrase of allowedPhrases) {
            if (phrase.includes(word)) {
              isInAllowedPhrase = true
              break
            }
          }
          if (!isInAllowedPhrase) {
            return { 
              isValid: false, 
              reason: `Текст содержит недопустимые слова` 
            }
          }
        } else {
          // Нет разрешенных фраз - строгая проверка
          return { 
            isValid: false, 
            reason: `Текст содержит недопустимые слова` 
          }
        }
      }
      // Слово содержит запрещенное слово (но не наоборот)
      else if (word.length >= forbiddenWord.length && word.includes(forbiddenWord)) {
        // Если это разрешенное слово, пропускаем
        if (isAllowedWord(word)) {
          continue
        }
        
        // Если есть разрешенная фраза, проверяем контекст
        if (hasAllowedPhrase) {
          // Разрешаем только если это точно часть разрешенной фразы
          let isInAllowedPhrase = false
          for (const phrase of allowedPhrases) {
            if (phrase.includes(word)) {
              isInAllowedPhrase = true
              break
            }
          }
          if (!isInAllowedPhrase) {
            return { 
              isValid: false, 
              reason: `Текст содержит недопустимые слова` 
            }
          }
        } else {
          return { 
            isValid: false, 
            reason: `Текст содержит недопустимые слова` 
          }
        }
      }
    }
  }
  
  // Дополнительная проверка: ищем запрещенные слова в нормализованном тексте с границами слов
  for (const forbiddenWord of forbiddenWords) {
    // Используем регулярное выражение для поиска слова с границами
    const escapedWord = forbiddenWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const wordBoundaryRegex = new RegExp(`\\b${escapedWord}\\b`, 'i')
    
    if (wordBoundaryRegex.test(normalizedLower)) {
      // Проверяем что это не часть разрешенной фразы
      if (!hasAllowedPhrase) {
        // Проверяем что это не часть разрешенного слова
        const wordsInText = normalizedLower.split(/\s+/)
        let foundInAllowed = false
        for (const word of wordsInText) {
          if (word.includes(forbiddenWord) && isAllowedWord(word)) {
            foundInAllowed = true
            break
          }
        }
        if (!foundInAllowed) {
          return { 
            isValid: false, 
            reason: `Текст содержит недопустимые слова` 
          }
        }
      } else {
        // Если есть разрешенная фраза, проверяем что запрещенное слово не является частью фразы
        let isInAllowedPhrase = false
        for (const phrase of allowedPhrases) {
          if (phrase.includes(forbiddenWord)) {
            isInAllowedPhrase = true
            break
          }
        }
        if (!isInAllowedPhrase) {
          // Проверяем что это не часть разрешенного слова
          const wordsInText = normalizedLower.split(/\s+/)
          let foundInAllowed = false
          for (const word of wordsInText) {
            if (word.includes(forbiddenWord) && isAllowedWord(word)) {
              foundInAllowed = true
              break
            }
          }
          if (!foundInAllowed) {
            return { 
              isValid: false, 
              reason: `Текст содержит недопустимые слова` 
            }
          }
        }
      }
    }
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

