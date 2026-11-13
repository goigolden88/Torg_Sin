import { Device, SITE, type Cdp, type Size } from './common.ts'

// Экран упал (#49): на устройстве — испорченная запись комнаты (участники не списком), «Мои
// комнаты» бросают ошибку при отрисовке — вместо белой страницы «Что-то пошло не так» и
// «Обновить»; меню на месте, «Настройки» открываются
export async function crash(cdp: Cdp, size: Size) {
  console.log(`Экран ошибки, ${size.width} px`)
  const device = await Device.open(cdp, size, 'сломанная копия')
  await device.goto(SITE + '#/')
  await device.waitText('Комнат пока нет')
  await device.eval(`new Promise((resolve, reject) => {
    const open = indexedDB.open('torgsin')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const tx = open.result.transaction('rooms', 'readwrite')
      tx.objectStore('rooms').put({ id: 'X', server: 'http://localhost:9', memberId: 'M', key: 'k', invite: null, name: 'Сломанная', currency: 'RUB', hostId: 'M', createdAt: 1, members: null, savedAt: 1, syncedAt: null })
      tx.oncomplete = () => {
        open.result.close()
        resolve(true)
      }
      tx.onerror = () => reject(tx.error)
    }
  })`)
  await device.reload()
  await device.waitText('Что-то пошло не так')
  const seen = await device.eval<{ button: boolean; nav: boolean }>(`({
    button: [...document.querySelectorAll('button')].some((b) => b.offsetParent !== null && b.innerText.trim() === 'Обновить'),
    nav: document.querySelector('.nav') !== null,
  })`)
  if (!seen.button || !seen.nav) throw new Error('Экран ошибки: ' + JSON.stringify(seen))
  const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  if (scroll > 0) throw new Error(`Экран ошибки на ${size.width} px: прокрутка вбок ${scroll} px`)
  await device.shot('42-oshibka-ekrana')
  // Другой раздел — открывается: перехват не держит ошибку после смены адреса
  await device.goto(SITE + '#/settings')
  await device.waitText('Сейчас:')
  if (await device.eval<boolean>(`document.body.innerText.includes('Что-то пошло не так')`)) throw new Error('После смены раздела осталась ошибка')
}
