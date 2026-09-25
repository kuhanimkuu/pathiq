import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { AuthContext } from './auth-context'

const PROFILE_WAIT_MS = 1500

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(error ? null : data)
  }, [])

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      // On weak or no signal the profile request retries for several seconds
      // before failing (and navigator.onLine often still says true). Wait for
      // it briefly, then show the app anyway; the profile fills in when it lands.
      const profileLoaded = loadProfile(data.session?.user?.id)
      const patience = new Promise((resolve) => setTimeout(resolve, PROFILE_WAIT_MS))
      Promise.race([profileLoaded, patience]).finally(() => !cancelled && setLoading(false))
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      loadProfile(nextSession?.user?.id)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadProfile])

  // The sign-up form collects a username; it's stored as user metadata and
  // copied onto the profile row by the handle_new_user trigger.
  async function signUp(email, password, username) {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { username } } })
    if (error) throw error
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  // Supabase issues a normal 'authenticated' session with no email or
  // password, so every RLS policy already written for authenticated users
  // covers guests too. See supabase/migrations/20260922000000_guest_mode.sql.
  async function continueAsGuest() {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) throw error
  }

  // Turns the current anonymous session into a real account, in place, so
  // whatever the guest saved (saved gems, trips) carries over.
  async function upgradeGuest(email, password, username) {
    const { error } = await supabase.auth.updateUser({ email, password, data: { username } })
    if (error) throw error
    if (username && session?.user?.id) {
      await supabase.from('profiles').update({ username }).eq('id', session.user.id)
      await loadProfile(session.user.id)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  // Re-reads the profile, e.g. after a trip ends and the server has
  // recomputed iq_score.
  const refreshProfile = useCallback(() => loadProfile(session?.user?.id), [loadProfile, session])

  async function setNotificationsOn(on) {
    const { error } = await supabase.from('profiles').update({ notifications_on: on }).eq('id', session.user.id)
    if (error) throw error
    await loadProfile(session.user.id)
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    isGuest: Boolean(session?.user?.is_anonymous),
    signUp,
    signIn,
    signOut,
    continueAsGuest,
    upgradeGuest,
    refreshProfile,
    setNotificationsOn,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
