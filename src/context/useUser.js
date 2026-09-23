import { useContext } from 'react'
import { UserContext } from './user-context'

export function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used inside a UserProvider')
  }
  return context
}
