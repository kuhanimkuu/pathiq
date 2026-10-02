// A suspended account can still use the map but can't add or rate anything
// (enforced in the database: block_suspended_writes). This turns the
// profile's suspension into a sentence for the app, or null when there's none.
export function suspensionNotice(profile) {
  const until = profile?.suspended_until
  if (!until) return null
  const forever = until === 'infinity'
  const end = new Date(until)
  if (!forever && !(end > new Date())) return null
  const when = forever
    ? 'until further notice'
    : `until ${end.toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
  return (
    `Your account is suspended ${when}, so you can't add road reports or gems, upload photos or rate places.` +
    (profile.suspension_reason ? ` Reason: ${profile.suspension_reason}` : '') +
    ' You can still use the map.'
  )
}
