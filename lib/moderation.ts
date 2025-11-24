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
  'тупой', 'тупая', 'тупой', 'тупость',
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

// Функция проверки текста на наличие запрещенных слов
export function moderateText(text: string): { isValid: boolean; moderatedText?: string; reason?: string } {
  const lowerText = text.toLowerCase()
  
  // Убираем знаки препинания для проверки
  const cleanText = lowerText.replace(/[.,!?;:()\-_\[\]{}'"]/g, ' ')
  const words = cleanText.split(/\s+/).filter(word => word.length > 0)
  
  // Проверяем каждое слово
  for (const word of words) {
    for (const forbiddenWord of forbiddenWords) {
      // Проверяем точное совпадение или вхождение
      if (word.includes(forbiddenWord) || forbiddenWord.includes(word)) {
        return { 
          isValid: false, 
          reason: `Текст содержит недопустимые слова` 
        }
      }
    }
  }
  
  // Проверяем фразы целиком
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

