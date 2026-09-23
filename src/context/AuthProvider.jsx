import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { AuthContext } from './auth-context'

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
      loadProfile(data.session?.user?.id).finally(() => !cancelled && setLoading(false))
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
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
