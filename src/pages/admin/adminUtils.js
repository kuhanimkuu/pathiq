import { useEffect, useState } from 'react'

export function formatDate(iso) {
  if (!iso) return '–'
  return new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Debounced value, for search boxes.
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// Must match admin_auth_fresh() in the admin_dashboard migration.
export const ADMIN_UNLOCK_MS = 60 * 60 * 1000

// When the admin dashboard locks again: one hour after the last password
// or Google sign-in recorded in the access token's `amr` claim (the same claim the
// database checks). 0 when there's none, e.g. a guest session.
export function adminUnlockedUntil(accessToken) {
  try {
    const part = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')))
    const times = (claims.amr ?? []).filter((m) => ['password', 'oauth', 'totp'].includes(m.method)).map((m) => m.timestamp)
    return times.length ? Math.max(...times) * 1000 + ADMIN_UNLOCK_MS : 0
  } catch {
    return 0
  }
}

// True while `until` is in the future; flips to false on its own when it passes.
export function useBefore(until) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const wait = until - Date.now()
    if (wait <= 0) return
    const t = setTimeout(() => setNow(Date.now()), Math.min(wait + 500, 2 ** 31 - 1))
    return () => clearTimeout(t)
  }, [until])
  return until > now
}

// "Tue 29 Sept" for a yyyy-mm-dd day.
export const dayLabel = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-KE', opts)

// "until lifted" (stored as Postgres infinity) or "until 9 Oct, 14:00".
export function suspendedUntilText(until) {
  const d = new Date(until)
  return !until || until === 'infinity' || Number.isNaN(d.getTime()) ? 'until lifted' : `until ${formatDate(until)}`
}
