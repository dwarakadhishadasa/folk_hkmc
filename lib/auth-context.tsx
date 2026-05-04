"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

export type UserRole = "volunteer" | "preacher"

export interface User {
  username: string
  password: string
  role: UserRole
}

// Static users - anyone can use these
export const USERS: User[] = [
  { username: "volunteer", password: "haribol123", role: "volunteer" },
  { username: "preacher", password: "haribol456", role: "preacher" },
]

interface AuthContextType {
  isLoggedIn: boolean
  username: string | null
  role: UserRole | null
  login: (username: string, password: string) => boolean
  logout: () => void
  isPreacher: boolean
  isVolunteer: boolean
  isHydrated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)

  // Hydrate from localStorage only on client
  useEffect(() => {
    const storedAuth = localStorage.getItem("folk_auth")
    if (storedAuth) {
      try {
        const { username, role } = JSON.parse(storedAuth)
        setIsLoggedIn(true)
        setUsername(username)
        setRole(role)
      } catch {
        localStorage.removeItem("folk_auth")
      }
    }
    setIsHydrated(true)
  }, [])

  const login = (inputUsername: string, inputPassword: string): boolean => {
    const user = USERS.find((u) => u.username === inputUsername && u.password === inputPassword)
    if (user) {
      setIsLoggedIn(true)
      setUsername(user.username)
      setRole(user.role)
      localStorage.setItem("folk_auth", JSON.stringify({ username: user.username, role: user.role }))
      return true
    }
    return false
  }

  const logout = () => {
    setIsLoggedIn(false)
    setUsername(null)
    setRole(null)
    localStorage.removeItem("folk_auth")
  }

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn,
        username,
        role,
        login,
        logout,
        isPreacher: role === "preacher",
        isVolunteer: role === "volunteer",
        isHydrated,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
