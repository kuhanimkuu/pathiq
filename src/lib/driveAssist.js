// Browser features that keep navigation useful on a mounted phone
// (features.md, "Decision: mobile-friendly PWA").

// Keeps the screen on while navigating — location tracking and gem alerts
// stop when the screen sleeps. The browser drops the lock whenever the page is
// hidden, so it's re-requested when the page becomes visible again.
// Returns a function that releases it.
export function holdWakeLock() {
  if (!('wakeLock' in navigator)) return () => {}
  let lock = null
  let released = false
  const acquire = async () => {
    if (released || document.visibilityState !== 'visible') return
    try {
      lock = await navigator.wakeLock.request('screen')
    } catch {
      // denied (e.g. battery saver) — navigation still works, the screen may sleep
    }
  }
  const onVisibility = () => document.visibilityState === 'visible' && acquire()
  document.addEventListener('visibilitychange', onVisibility)
  acquire()
  return () => {
    released = true
    document.removeEventListener('visibilitychange', onVisibility)
    lock?.release().catch(() => {})
  }
}

export function notificationsSupported() {
  return 'Notification' in window
}

// Asks for permission if it hasn't been decided yet. Resolves to true if
// notifications can be shown.
export async function ensureNotificationPermission() {
  if (!notificationsSupported()) return false
  if (Notification.permission === 'default') await Notification.requestPermission()
  return Notification.permission === 'granted'
}

// A system notification, only when the app isn't on screen (when it is, the
// in-app alert is enough). Goes through the service worker when there is one,
// which is required on Android.
export async function notifyIfHidden(title, body) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) {
      await registration.showNotification(title, { body, icon: '/icons/icon-192.png', tag: 'pathiq-gem' })
    } else {
      new Notification(title, { body, icon: '/icons/icon-192.png' })
    }
  } catch {
    // notifications are best-effort
  }
}
