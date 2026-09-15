import { createContext, useContext, useState } from 'react'
import { currentUser as initialUser } from '../data/mockData'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser] = useState(initialUser)

  function updateIQScore(newScore) {
    setUser((prev) => ({ ...prev, iqScore: newScore }))
  }

  const value = { user, updateIQScore }

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used inside a UserProvider')
  }
  return context
}