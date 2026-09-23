import { useState } from 'react'
import { currentUser as mockStats } from '../data/mockData'
import { useAuth } from './useAuth'
import { UserContext } from './user-context'

// Bridges the real Supabase profile to the shape the app's pages expect.
// tripsThisMonth and gemsFound aren't tracked yet (no trips/stats backend),
// so they still come from mock data — see features.md, "Home dashboard".
export function UserProvider({ children }) {
  const { profile, isGuest } = useAuth()
  // iq_score isn't client-writable (see supabase/README.md) and the scoring
  // algorithm itself isn't built yet (features.md, phase 3), so the "+1 IQ
  // Score (test)" button only ever adjusts this local override.
  const [iqOverride, setIqOverride] = useState(null)

  const user = {
    ...mockStats,
    name: profile?.display_name || profile?.username || (isGuest ? 'Guest' : mockStats.name),
    iqScore: iqOverride ?? profile?.iq_score ?? mockStats.iqScore,
    isGuest,
  }

  function updateIQScore(newScore) {
    setIqOverride(newScore)
  }

  const value = { user, updateIQScore }

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}
