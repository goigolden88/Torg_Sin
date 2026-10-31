import { describe, expect, it } from 'vitest'
import { DEFAULT_SERVER } from './address'
import { inviteLink, parseInviteLink } from './link'

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
})
