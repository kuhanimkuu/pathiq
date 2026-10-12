import { useEffect } from 'react'

const SITE = 'PathIQ Navigators'

// "About · PathIQ Navigators" while the page is open; the site name again after.
export default function usePageTitle(title) {
  useEffect(() => {
    if (!title) return
    document.title = `${title} · ${SITE}`
    return () => {
      document.title = SITE
    }
  }, [title])
}
