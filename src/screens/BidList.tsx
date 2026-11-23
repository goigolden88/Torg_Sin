// Ставки торга — общее у «Торга до …» пари (встречные, Р-37) и лота (ставки, Р-38): кто, сколько, когда,
// новые сверху (видны всем, Р-11); у лучшей — пометка: пока торг идёт — «лучшая» / «лучшее», после — «принято»
// или «выиграла»
import { formatDateTime } from '../rules/date'
import type { SavedRoom } from '../store/db'
import { money } from './eventParts'
import { who } from './offerParts'

export type Bid = { id: string; at: number; by: string; amount: number }

export function BidList({ room, bids, bestId, badge, label }: { room: SavedRoom; bids: readonly Bid[]; bestId: string | null; badge: string; label: string }) {
  return (
    <ul className="bid-list" aria-label={label}>
      {[...bids].reverse().map((b) => (
        <li key={b.id} className={b.id === bestId ? 'bid best' : 'bid'}>
          <span className="bid-who">{who(room, b.by)}</span>
          <span className="bid-sum">{money(b.amount, room.currency)}</span>
          <span className="hint">{formatDateTime(b.at)}</span>
          {b.id === bestId && <span className="badge">{badge}</span>}
        </li>
      ))}
    </ul>
  )
}
