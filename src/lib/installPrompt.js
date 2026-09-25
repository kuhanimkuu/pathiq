// "Add to home screen" (features.md: install prompt). Chrome/Edge/Android fire
// beforeinstallprompt once the app is installable; we hold on to it so the
// Profile page can offer an Install button. iPhone has no such event — there
// it's Share → Add to Home Screen, which the Profile page explains instead.

let deferred = null
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e
  notify()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  notify()
})

export const canInstall = () => deferred !== null

export const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

export function onInstallChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function promptInstall() {
  if (!deferred) return false
  deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  notify()
  return outcome === 'accepted'
}
