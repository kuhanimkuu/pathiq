import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { UserContext } from './user-context'
import { fetchDriverStats } from '../lib/trips'

// Bridges the real Supabase profile and driver stats to the shape the app's
// pages expect. iqScore is null until the driver has a counted trip in the
// last 30 days (see the trip tracking migration for the formula).
export function UserProvider({ children }) {
  const { session, profile, isGuest, refreshProfile } = useAuth()
  const userId = session?.user?.id
  const [stats, setStats] = useState({ tripsThisMonth: null, gemsFound: null })

  const refreshStats = useCallback(async () => {
    if (!userId) return
    try {
      setStats(await fetchDriverStats())
    } catch {
      // stat cards just show "–"; nothing else depends on them
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchDriverStats()
      .then((s) => !cancelled && setStats(s))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])

  // Pages call this on mount so numbers are current after a trip.
  const refresh = useCallback(() => Promise.all([refreshStats(), refreshProfile()]), [refreshStats, refreshProfile])

  const user = {
    name: profile?.display_name || profile?.username || 'Guest',
    iqScore: profile?.iq_score ?? null,
    tripsThisMonth: stats.tripsThisMonth,
    gemsFound: stats.gemsFound,
    isGuest,
  }

  const value = { user, refresh }

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}
