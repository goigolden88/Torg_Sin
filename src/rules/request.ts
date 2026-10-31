// Номер запроса (ULID) для повторяемых действий — создать комнату, подать заявку (Р-13).
// Повтор той же формы (двойное нажатие, ответ потерялся, «Создать» ещё раз после «нет связи»)
// идёт с тем же номером — сервер отдаёт ту же комнату. Форму поменяли — номер новый: старый
// номер с другой формой сервер отклонит (409). Общее для экрана и сервера: ни DOM, ни Cloudflare
export type PendingRequest = { form: string; requestId: string }

// form — содержимое формы одной строкой (formKey)
export function requestFor(pending: PendingRequest | null, form: string, newId: () => string): PendingRequest {
  return pending && pending.form === form ? pending : { form, requestId: newId() }
}

// Строка формы: поля по порядку, без пробелов по краям — как их увидит сервер
export function formKey(...fields: string[]): string {
  return JSON.stringify(fields.map((f) => f.trim()))
}
