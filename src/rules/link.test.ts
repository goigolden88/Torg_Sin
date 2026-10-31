import { describe, expect, it } from 'vitest'
import { DEFAULT_SERVER } from './address'
import { deviceLink, inviteLink, parseDeviceLink, parseInviteLink } from './link'

const SITE = 'https://goigolden88.github.io/Torg_Sin/'
const ROOM = '01JBXK7Z9M3Q4R5S6T7V8W9XYZ'
const TOKEN = 'aB3_x-Yz09QwErTy12345A'

describe('inviteLink', () => {
  it('сервер по умолчанию — без параметра', () => {
    expect(inviteLink(SITE, { roomId: ROOM, invite: TOKEN, server: DEFAULT_SERVER })).toBe(`${SITE}#/join/${ROOM}/${TOKEN}`)
  })
  it('свой сервер — параметром в ссылке', () => {
    const link = inviteLink(SITE, { roomId: ROOM, invite: TOKEN, server: 'https://torg.example.com/api' })
    expect(link).toBe(`${SITE}#/join/${ROOM}/${TOKEN}?server=https%3A%2F%2Ftorg.example.com%2Fapi`)
  })
  it('хеш открытой страницы в адрес сайта не попадает', () => {
    expect(inviteLink(SITE + '#/room/x', { roomId: ROOM, invite: TOKEN, server: DEFAULT_SERVER })).toBe(`${SITE}#/join/${ROOM}/${TOKEN}`)
  })
})

describe('parseInviteLink', () => {
  it('разбирает то, что собрал inviteLink', () => {
    for (const server of [DEFAULT_SERVER, 'https://torg.example.com', 'http://localhost:8787']) {
      const link = { roomId: ROOM, invite: TOKEN, server }
      expect(parseInviteLink(inviteLink(SITE, link))).toEqual(link)
    }
  })
  it('понимает и один хеш', () => {
    expect(parseInviteLink(`#/join/${ROOM}/${TOKEN}`)).toEqual({ roomId: ROOM, invite: TOKEN, server: DEFAULT_SERVER })
  })
  it('не ссылка-приглашение — null', () => {
    expect(parseInviteLink(SITE)).toBeNull()
    expect(parseInviteLink(`${SITE}#/room/${ROOM}`)).toBeNull()
    expect(parseInviteLink(`${SITE}#/join/${ROOM}`)).toBeNull()
    expect(parseInviteLink(`${SITE}#/join/кривой/${TOKEN}`)).toBeNull()
    expect(parseInviteLink(`${SITE}#/join/${ROOM}/токен`)).toBeNull()
  })
  it('кривой адрес сервера — null, а не сервер по умолчанию', () => {
    expect(parseInviteLink(`${SITE}#/join/${ROOM}/${TOKEN}?server=http%3A%2F%2Ftorg.example.com`)).toBeNull()
    expect(parseInviteLink(`${SITE}#/join/${ROOM}/${TOKEN}?server=`)).toBeNull()
  })
  it('ссылка для другого устройства — не приглашение', () => {
    expect(parseInviteLink(`${SITE}#/device/${ROOM}/${TOKEN}`)).toBeNull()
  })
})

describe('deviceLink', () => {
  it('сервер по умолчанию — без параметра, свой — параметром', () => {
    expect(deviceLink(SITE, { roomId: ROOM, token: TOKEN, server: DEFAULT_SERVER })).toBe(`${SITE}#/device/${ROOM}/${TOKEN}`)
    expect(deviceLink(SITE + '#/room/x', { roomId: ROOM, token: TOKEN, server: 'http://localhost:8787' })).toBe(
      `${SITE}#/device/${ROOM}/${TOKEN}?server=http%3A%2F%2Flocalhost%3A8787`,
    )
  })
})

describe('parseDeviceLink', () => {
  it('разбирает то, что собрал deviceLink', () => {
    for (const server of [DEFAULT_SERVER, 'https://torg.example.com/api', 'http://127.0.0.1:8787']) {
      const link = { roomId: ROOM, token: TOKEN, server }
      expect(parseDeviceLink(deviceLink(SITE, link))).toEqual(link)
    }
  })
  it('не ссылка для устройства — null', () => {
    expect(parseDeviceLink(`${SITE}#/join/${ROOM}/${TOKEN}`)).toBeNull()
    expect(parseDeviceLink(`${SITE}#/device/${ROOM}`)).toBeNull()
    expect(parseDeviceLink(`${SITE}#/device/${ROOM}/токен`)).toBeNull()
    expect(parseDeviceLink(`${SITE}#/device/${ROOM}/${TOKEN}?server=ftp%3A%2F%2Fx.ru`)).toBeNull()
  })
})
