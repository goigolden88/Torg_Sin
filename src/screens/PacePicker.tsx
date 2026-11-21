// Выбор темпа комнаты (Р-35): «Обычный» / «Быстрый» / «Свой», под каждым — его сроки строкой; у «своего»
// — четыре списка из допустимых значений (TIME_CHOICES) и пояснение каждого срока. Им пользуются «Создать
// комнату» и окно «Изменить темп» в комнате. Подписи и запрос — paceParts
import { durationText, paceSummary, PACES, TIME_CHOICES, TIME_KEYS, TIME_LABELS, type Pace, type TimeKey } from '../rules/pace'
import { capital, draftTimes, PACE_TITLE, TIME_ABOUT, type PaceDraft } from './paceParts'

export function PacePicker({
  value,
  onChange,
  current,
  autoFocus = false,
}: {
  value: PaceDraft
  onChange: (next: PaceDraft) => void
  current?: Pace // нынешний темп комнаты — пометка «(сейчас)» в окне смены; нет — это создание комнаты
  autoFocus?: boolean
}) {
  const creating = current === undefined
  const setTime = (k: TimeKey, ms: number) => onChange({ ...value, custom: { ...value.custom, [k]: ms } })
  return (
    <fieldset className="field pace-picker">
      <legend>Темп споров</legend>
      {PACES.map((p) => (
        <label key={p} className="check">
          <input type="radio" name="pace" value={p} checked={value.pace === p} onChange={() => onChange({ ...value, pace: p })} autoFocus={autoFocus && value.pace === p} />
          <span>
            <span>
              {PACE_TITLE[p]}
              {p === current ? <span className="hint"> (сейчас)</span> : null}
            </span>
            <span className="hint">{paceSummary(draftTimes({ ...value, pace: p }))}</span>
          </span>
        </label>
      ))}
      {value.pace === 'custom' && (
        <div className="pace-custom">
          {TIME_KEYS.map((k) => (
            <label key={k} className="field">
              <span>{capital(TIME_LABELS[k])}</span>
              <select className="input" value={value.custom[k]} onChange={(e) => setTime(k, Number(e.target.value))}>
                {TIME_CHOICES[k].map((ms) => (
                  <option key={ms} value={ms}>
                    {durationText(ms)}
                  </option>
                ))}
              </select>
              <span className="hint">{capital(TIME_ABOUT[k])}.</span>
            </label>
          ))}
        </div>
      )}
      {creating && <span className="hint">Сроки закрепляются в событии и пари при создании. Ведущий может сменить темп в комнате.</span>}
    </fieldset>
  )
}
