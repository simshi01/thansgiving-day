// Расширенный список запрещенных слов на русском языке
const forbiddenWords = [
  // Матерные слова (основные)
  'блять', 'блядь', 'бля', 'бляд', 'блят',
  'хуй', 'хуйня', 'хуе', 'хуё', 'хуев', 'хуевый',
  'пизда', 'пиздец', 'пизд', 'пиздюк', 'пиздюля',
  'ебан', 'ебать', 'ебал', 'ебат', 'ебану', 'ебануть',
  'ебло', 'ебанько', 'ебу', 'ебаш', 'ебаш',
  'сука', 'суки', 'сучара', 'сучий',
  'мудак', 'мудачок', 'мудила',
  'гандон', 'гондон',
  'залупа', 'залуп',
  'дроч', 'дрочить',
  'шлюха', 'шлюх',
  'блядина', 'бляди',
  
  // Плохие слова и оскорбления
  'жопа', 'жоп', 'жопка', 'жопный',
  'дурак', 'дура', 'дурачок', 'дурацкий',
  'идиот', 'идиотка', 'идиотский',
  'тупой', 'тупая', 'тупость',
  'дебил', 'дебилка', 'дебильный',
  'кретин', 'кретинка',
  'придурок', 'придурочный',
  'мразь', 'мразота',
  'гад', 'гадина',
  'сволочь', 'сволочи',
  'подонок', 'подонки',
  'ублюдок', 'ублюдки',
  'скотина', 'скотины',
  
  // Негативные слова, не подходящие для благодарностей
  'ненавижу', 'ненависть',
  'убить', 'убийство',
  'смерть', 'умереть',
  'плохо', 'плохой', 'плохая',
  'гадость', 'гадкий',
]

// Список разрешенных слов, которые могут содержать части запрещенных слов
const allowedWords = [
  'мама', 'маму', 'маме', 'мамой', 'матери', 'матерью',
  'бог', 'бога', 'богу', 'богом', 'боже', 'божья', 'божью',
  'за', 'зам', 'зато', 'зачем',
  'благодар', 'благодарность', 'благодарить', 'благодарен',
  'родители', 'родителям', 'родителями',
  'семья', 'семье', 'семьей',
  'друзья', 'друзьям', 'друзьями',
  'жизнь', 'жизни', 'жизнью',
  'любовь', 'любви', 'любовью',
]

// Функция проверки текста на наличие запрещенных слов
export function moderateText(text: string): { isValid: boolean; moderatedText?: string; reason?: string } {
  const lowerText = text.toLowerCase().trim()
  
  // Сначала проверяем разрешенные слова - если текст содержит их, проверяем только явные запрещенные
  let hasAllowedWord = false
  for (const allowedWord of allowedWords) {
    if (lowerText.includes(allowedWord)) {
      hasAllowedWord = true
      break
    }
  }
  
  // Убираем знаки препинания для проверки
  const cleanText = lowerText.replace(/[.,!?;:()\-_\[\]{}'"]/g, ' ')
  const words = cleanText.split(/\s+/).filter(word => word.length > 0)
  
  // Проверяем каждое слово на точное совпадение с запрещенными
  for (const word of words) {
    // Пропускаем короткие слова (меньше 3 символов) если есть разрешенные слова
    if (hasAllowedWord && word.length < 3) continue
    
    for (const forbiddenWord of forbiddenWords) {
      // Точное совпадение слова
      if (word === forbiddenWord) {
        // Если есть разрешенные слова, проверяем что это не часть разрешенного
        if (hasAllowedWord) {
          let isPartOfAllowed = false
          for (const allowedWord of allowedWords) {
            if (allowedWord.includes(forbiddenWord) && allowedWord.length > forbiddenWord.length) {
              isPartOfAllowed = true
              break
            }
          }
          if (!isPartOfAllowed) {
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
      // Слово содержит запрещенное слово (но не наоборот, чтобы не блокировать "мама")
      else if (word.length >= forbiddenWord.length && word.includes(forbiddenWord)) {
        // Проверяем что это не часть разрешенного слова
        if (hasAllowedWord) {
          let isPartOfAllowed = false
          for (const allowedWord of allowedWords) {
            if (allowedWord.includes(word) || word.includes(allowedWord)) {
              isPartOfAllowed = true
              break
            }
          }
          if (!isPartOfAllowed) {
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
  
  // Если есть разрешенные слова, разрешаем (уже проверили явные запрещенные выше)
  if (hasAllowedWord) {
    return { isValid: true, moderatedText: text }
  }
  
  // Если нет разрешенных слов, проверяем фразы целиком
  for (const forbiddenWord of forbiddenWords) {
    if (lowerText.includes(forbiddenWord)) {
      return { 
        isValid: false, 
        reason: `Текст содержит недопустимые слова` 
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

