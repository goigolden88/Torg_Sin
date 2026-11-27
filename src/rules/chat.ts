// «Позвать в чат» (#150): готовое сообщение в чат компании — что случилось, сумма в валюте комнаты (как на
// экране; комната на очки — очки) и что сделать, в конце — ссылка на экран: <сайт>#/room/<номер>/offer/<номер>,
// …/event/…, …/lot/…, …/choice/…, …/settle. Ссылка открывает экран у участника комнаты; у кого комнаты на
// устройстве нет — как любая чужая ссылка. Кому сообщение — не пишем: оно уходит в общий чат. Общее для
// экранов; чистые функции с тестами (chat.test.ts)
import { formatAmount, isCurrencyCode } from './currency'

// Экран, на который ведёт ссылка
export type ChatScreen = { kind: 'offer' | 'event' | 'lot' | 'choice'; id: string } | { kind: 'settle' }

// site — адрес сайта с base сборки (https://goigolden88.github.io/Torg_Sin/); хеш в нём не мешает
export function screenLink(site: string, roomId: string, screen: ChatScreen): string {
  const base = site.split('#')[0]
  return `${base}#/room/${roomId}/` + (screen.kind === 'settle' ? 'settle' : `${screen.kind}/${screen.id}`)
}

// Что случилось — по экрану. Суммы — целыми в минимальных единицах валюты комнаты
export type ChatNews =
  // Пари: открытое — «принять или встречное»; торг (Р-37) — сумма автора и лучшее встречное или старт;
  // принятое — кто против кого и банк; прочее (истекло, отозвано, закрыто встречным, не состоялось) — как есть
  | {
      kind: 'offer'
      author: string
      condition: string
      odds: { a: number; b: number }
      amount: number // ставит автор
      state: 'open' | 'accepted' | 'other'
      auction?: { start: number; best: number | null } // торг: лучшее встречное (null — ещё нет)
      taker?: string // принявший (у принятого)
      bank?: number // банк (у принятого)
      // На обещание (Р-44): что сделает автор и соперник, если проиграет; суммы и кэфа тогда в тексте нет
      promise?: { author: string; taker: string }
    }
  // Событие: банк; приём идёт — «ставьте», закрыт — «исход», отменено — так и пишем
  | { kind: 'event'; condition: string; bank: number; state: 'open' | 'closed' | 'cancelled' }
  // Лот: идёт торг — лучшая ставка или старт; продан — за сколько; прочее — торг закончен
  | { kind: 'lot'; seller: string; title: string; state: 'open' | 'sold' | 'other'; start: number; best: number | null }
  // «Выбор»: фаза вариантов, вкладов (сколько вложено и кто впереди), жребий, решён, не состоялся
  | {
      kind: 'choice'
      question: string
      state: 'options' | 'open' | 'draw' | 'decided' | 'failed'
      total: number // вложено во все варианты
      lead: { title: string; total: number } | null // впереди (вкладов нет — null) или победил
    }
  // Суд по спору (Р-05): собран, решения ещё нет
  | { kind: 'court'; target: 'offer' | 'event' | 'lot'; title: string }
  // «Расчёт» комнаты: «кто кому» из подсказки сервера; в комнате на очки — итоги участников
  | { kind: 'settle'; room: string; transfers: { from: string; to: string; amount: number }[] }
  | { kind: 'points'; room: string; totals: { name: string; amount: number }[] }

// Сумма как на экране: известная валюта — formatAmount («1 200 ₽», «15 очков»), иначе — число и код
function money(units: number, currency: string): string {
  return isCurrencyCode(currency) ? formatAmount(units, currency) : `${units} ${currency}`
}

// Итог очков со знаком: «+15 очков», «−5 очков», «0 очков»
function signed(units: number, currency: string): string {
  return (units > 0 ? '+' : '') + money(units, currency)
}

// Текст сообщения: что случилось и что сделать, ссылка — в конце после двоеточия
export function chatMessage(news: ChatNews, currency: string, link: string): string {
  return `${chatText(news, currency)}: ${link}`
}

function chatText(n: ChatNews, currency: string): string {
  const sum = (units: number) => money(units, currency)
  switch (n.kind) {
    case 'offer': {
      if (n.promise) {
        const p = n.promise
        if (n.state === 'open') {
          return `${n.author} предлагает пари на обещание: „${n.condition}“ — проиграет ${n.author}: ${p.author}; проиграет соперник: ${p.taker}. Принять или встречное`
        }
        if (n.state === 'accepted' && n.taker !== undefined) {
          return `Пари на обещание „${n.condition}“ принято: ${n.author} — ${n.taker}. Исход — по ссылке`
        }
        return `Пари на обещание „${n.condition}“ (${n.author}). Посмотрите`
      }
      if (n.auction) {
        if (n.state === 'open') {
          const best = n.auction.best === null ? `встречные — от ${sum(n.auction.start)}` : `лучшее встречное — ${sum(n.auction.best)}`
          return `${n.author} предлагает пари: „${n.condition}“ — торг, ставит ${sum(n.amount)}, ${best}. Дайте больше`
        }
      } else if (n.state === 'open') {
        return `${n.author} предлагает пари: „${n.condition}“ — ${n.odds.a} к ${n.odds.b}, ${sum(n.amount)}. Принять или встречное`
      }
      if (n.state === 'accepted' && n.taker !== undefined && n.bank !== undefined) {
        return `Пари „${n.condition}“ принято: ${n.author} — ${n.taker}, банк ${sum(n.bank)}. Исход — по ссылке`
      }
      return `Пари „${n.condition}“ (${n.author}, ${sum(n.amount)}). Посмотрите`
    }
    case 'event': {
      const bank = n.bank > 0 ? `банк ${sum(n.bank)}` : 'ставок пока нет'
      if (n.state === 'cancelled') return `Событие „${n.condition}“ отменено. Посмотрите`
      if (n.state === 'closed') return `Событие „${n.condition}“: ${bank}, приём закрыт. Исход — по ссылке`
      return `Событие „${n.condition}“: ${bank}. Ставьте`
    }
    case 'lot': {
      if (n.state === 'open') {
        return n.best === null
          ? `${n.seller} продаёт лот „${n.title}“: старт ${sum(n.start)}. Ставьте`
          : `${n.seller} продаёт лот „${n.title}“: лучшая ставка ${sum(n.best)}. Перебейте`
      }
      if (n.state === 'sold' && n.best !== null) return `Лот „${n.title}“ (${n.seller}) продан за ${sum(n.best)}. Посмотрите`
      return `Лот „${n.title}“ (${n.seller}): торг закончен. Посмотрите`
    }
    case 'choice': {
      if (n.state === 'options') return `Выбор „${n.question}“: предлагайте варианты`
      if (n.state === 'failed') return `Выбор „${n.question}“ не состоялся. Посмотрите`
      if (n.state === 'draw') return `Выбор „${n.question}“: ничья, вложено ${sum(n.total)} — решит жребий. Посмотрите`
      if (n.state === 'decided') {
        return n.lead ? `Выбор „${n.question}“: победил „${n.lead.title}“ — ${sum(n.lead.total)} из ${sum(n.total)}. Посмотрите` : `Выбор „${n.question}“ решён. Посмотрите`
      }
      return n.lead
        ? `Выбор „${n.question}“: вложено ${sum(n.total)}, впереди „${n.lead.title}“ — ${sum(n.lead.total)}. Вкладывайте`
        : `Выбор „${n.question}“: вкладов пока нет. Вкладывайте`
    }
    case 'court': {
      const what = n.target === 'event' ? 'событию' : n.target === 'lot' ? 'лоту' : 'пари'
      return `Нужен суд по ${what} „${n.title}“ — вы в составе`
    }
    case 'settle': {
      if (n.transfers.length === 0) return `Расчёт комнаты „${n.room}“: все в расчёте, переводить нечего. Посмотрите`
      const list = n.transfers.map((t) => `${t.from} → ${t.to} ${sum(t.amount)}`).join(', ')
      return `Расчёт комнаты „${n.room}“: ${list}. Отметьте переводы`
    }
    case 'points': {
      if (n.totals.length === 0) return `Таблица очков комнаты „${n.room}“: пока пусто. Посмотрите`
      const list = n.totals.map((t) => `${t.name} ${signed(t.amount, currency)}`).join(', ')
      return `Таблица очков комнаты „${n.room}“: ${list}. Посмотрите`
    }
  }
}
