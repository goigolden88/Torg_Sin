import { describe, expect, it } from 'vitest'
import { formKey, requestFor } from './request'

describe('requestFor', () => {
  let n = 0
  const newId = () => 'R' + ++n

  it('первый раз — новый номер', () => {
    expect(requestFor(null, formKey('Дача', 'RUB'), newId).requestId).toMatch(/^R\d+$/)
  })
  it('та же форма — тот же номер (двойное нажатие, повтор после «нет связи»)', () => {
    const first = requestFor(null, formKey('Дача', 'RUB', 'Аня'), newId)
    const again = requestFor(first, formKey(' Дача ', 'RUB', 'Аня'), newId)
    expect(again.requestId).toBe(first.requestId)
  })
  it('форму поменяли — новый номер', () => {
    const first = requestFor(null, formKey('Дача', 'RUB', 'Аня'), newId)
    expect(requestFor(first, formKey('Дача', 'USD', 'Аня'), newId).requestId).not.toBe(first.requestId)
    expect(requestFor(first, formKey('Дача', 'RUB', 'Аня', 'другой пароль'), newId).requestId).not.toBe(first.requestId)
  })
  it('поля не склеиваются: «а» + «бв» ≠ «аб» + «в»', () => {
    expect(formKey('а', 'бв')).not.toBe(formKey('аб', 'в'))
  })
})
