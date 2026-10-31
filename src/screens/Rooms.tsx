// «Мои комнаты» — пока пустое состояние; комнаты и вход — этап 1.
// Раскладка «список + открытое» (.split): на телефоне — одно под другим, на компьютере — рядом
export function Rooms() {
  return (
    <div className="screen">
      <h1>Мои комнаты</h1>
      <div className="split">
        <section className="card">
          <p className="empty">Комнат пока нет.</p>
          <p className="hint">Войти в комнату — по ссылке от ведущего. Создать свою — скоро: нужен пароль компании.</p>
        </section>
        <section className="card detail">
          <p className="hint">Здесь будет открытая комната: события, пари, история.</p>
        </section>
      </div>
    </div>
  )
}
