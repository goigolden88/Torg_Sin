import { describe, expect, it } from 'vitest'
import { parseTheme, resolveTheme, THEME_CHOICES } from './theme'

describe('тема (Р-50, #166)', () => {
  it('записанное на устройстве: тёмная и светлая — как есть, остальное — как в системе', () => {
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme(null)).toBe('system')
    expect(parseTheme('')).toBe('system')
    expect(parseTheme('Dark')).toBe('system')
    expect(parseTheme('system')).toBe('system')
  })

  it('на экране: выбор главнее системы, «как в системе» — по системе', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('в «Настройках» — три кнопки по порядку', () => {
    expect(THEME_CHOICES.map((c) => c.label)).toEqual(['Как в системе', 'Тёмная', 'Светлая'])
  })
})
