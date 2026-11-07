// Перехват ошибки отрисовки: экран упал (например, старая копия на устройстве не того вида) —
// вместо белой страницы «Что-то пошло не так» и «Обновить». Свой компонент, без зависимостей
// (Р-12): у React перехват есть только в классе. Сменился адрес (resetKey) — пробуем снова
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { resetKey: string; children: ReactNode }
type State = { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Экран упал', error, info.componentStack)
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div className="card crash" role="alert">
        <h2>Что-то пошло не так</h2>
        <p className="hint">Экран не открылся. Обновите страницу — данные на устройстве не пропадут.</p>
        <div className="row">
          <button className="button" type="button" onClick={() => location.reload()}>
            Обновить
          </button>
        </div>
      </div>
    )
  }
}
