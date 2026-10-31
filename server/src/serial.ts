// Вызовы одной комнаты — по одному, как у объекта Room на Cloudflare: двойное создание не
// создаст двух комнат. Нужно обёртке без Cloudflare (Node, Р-02) и подделке в тестах
export type Serial = (<T>(key: string, task: () => Promise<T>) => Promise<T>) & {
  idle(): Promise<void> // дождаться всех начатых вызовов
}

export function perKey(): Serial {
  const tails = new Map<string, Promise<unknown>>()
  const serial = <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve()
    const run = previous.then(task, task)
    const tail = run.catch(() => undefined)
    tails.set(key, tail)
    // Очередь пуста — ключ забывается: память не растёт с числом комнат
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key)
    })
    return run
  }
  return Object.assign(serial, { idle: async () => void (await Promise.all(tails.values())) })
}
