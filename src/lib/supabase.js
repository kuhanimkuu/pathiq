import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in ' +
      '(supabase status prints the local values once `supabase start` is running).',
  )
}

// Network failures surface as a bare "TypeError: Failed to fetch", which pages
// would otherwise show verbatim. postgrest-js formats them as "<name>: <message>",
// so name and message are chosen to read as one sentence.
function fetchWithFriendlyErrors(...args) {
  return fetch(...args).catch((err) => {
    if (err?.name === 'AbortError') throw err
    const friendly = new TypeError('check your connection and try again.')
    friendly.name = "Can't reach PathIQ"
    throw friendly
  })
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithFriendlyErrors },
})
