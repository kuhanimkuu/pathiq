import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { AuthContext } from './auth-context'

const PROFILE_WAIT_MS = 1500

// Coming back from Google, Supabase reports failures in the URL (query or
// hash). Turn them into a sentence and tidy the URL.
const OAUTH_ERRORS = {
  identity_already_exists:
    'That Google account already has a PathIQ account. Sign out of this guest session, then sign in with Google to use it.',
  access_denied: 'Google sign-in was cancelled.',
}
function takeOAuthError() {
  const url = new URL(window.location.href)
  const params = new URLSearchParams(url.search + '&' + url.hash.slice(1))
  if (!params.get('error') && !params.get('error_code')) return ''
  const message =
    OAUTH_ERRORS[params.get('error_code')] ??
    OAUTH_ERRORS[params.get('error')] ??
    params.get('error_description') ??
    'Google sign-in didn’t work. Please try again.'
  for (const key of ['error', 'error_code', 'error_description']) url.searchParams.delete(key)
  window.history.replaceState(null, '', url.pathname + url.search)
  return message
}

// Google's name for the person, from the user or from their Google identity.
function googleName(user) {
  const meta = user?.user_metadata ?? {}
  const identity = user?.identities?.find((i) => i.provider === 'google')?.identity_data ?? {}
  return (meta.full_name || meta.name || identity.full_name || identity.name || '').trim().slice(0, 60)
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authNotice, setAuthNotice] = useState(takeOAuthError)
  // Google buttons only show once Google is switched on in Supabase Auth
  // (public settings endpoint), so nothing points at a disabled provider.
  const [googleEnabled, setGoogleEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((settings) => !cancelled && setGoogleEnabled(Boolean(settings?.external?.google)))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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

  // Signing in with (or linking) Google gives us the person's name; use it
  // when the profile has none yet. Only display_name: usernames stay theirs.
  useEffect(() => {
    const name = googleName(session?.user)
    if (!profile || profile.display_name || !name) return
    supabase
      .from('profiles')
      .update({ display_name: name })
      .eq('id', profile.id)
      .select()
      .single()
      .then(({ data }) => data && setProfile(data))
  }, [profile, session])

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

  // Leaves for Google's sign-in page and comes back to `next` signed in
  // (supabase-js reads the session from the URL on return).
  async function signInWithGoogle(next = '/app') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + next, queryParams: { prompt: 'select_account' } },
    })
    if (error) throw error
  }

  // For guests: attach Google to the current (anonymous) user rather than
  // signing in as someone new, so saved gems and trips carry over. Needs
  // "Allow manual linking" on in Supabase Auth.
  async function linkGoogle(next = '/app/profile') {
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: window.location.origin + next, queryParams: { prompt: 'select_account' } },
    })
    if (error) throw error
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
    googleEnabled,
    signInWithGoogle,
    linkGoogle,
    hasGoogle: Boolean(session?.user?.identities?.some((i) => i.provider === 'google')),
    hasPassword: Boolean(session?.user?.identities?.some((i) => i.provider === 'email')),
    authNotice,
    clearAuthNotice: () => setAuthNotice(''),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
