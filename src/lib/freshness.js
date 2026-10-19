// The installed app can sit in the background for days running the code it
// started with. On the sign-in screen that matters: an old copy can miss a
// security step the server now requires (the captcha, for one). So the
// sign-in screen checks whether a newer version is live and reloads once.
const KEY = 'ironlog-fresh-reload'

function bundleName(src) {
  return src?.match(/assets\/index-[^"/]+\.js/)?.[0] || null
}

export async function reloadIfStale() {
  const mine = bundleName(document.querySelector('script[type="module"][src*="assets/index-"]')?.getAttribute('src'))
  if (!mine) return // the dev server has no built bundle
  try {
    const res = await fetch(`./index.html?v=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const live = bundleName(await res.text())
    if (!live || live === mine) return
    // Never loop: one reload per minute at most.
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem(KEY, String(Date.now()))
    window.location.reload()
  } catch {
    // offline or private mode: carry on with this copy
  }
}
