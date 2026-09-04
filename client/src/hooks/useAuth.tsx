import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, getGuestId } from '../lib/api'
import type { AuthResponse, User } from '../types'

type AuthContextValue = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  loginWithUser: (user: User) => void
  refreshUser: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function mergeGuestCart() {
  try {
    await api.post('/cart/merge', undefined, {
      headers: { 'X-Guest-Id': getGuestId() },
    })
  } catch {
    // Guest cart may be empty; ignore merge failures.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get<User>('/auth/me')
      setUser(data)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    async function loadUser() {
      await refreshUser()
      setLoading(false)
    }

    void loadUser()
  }, [refreshUser])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const { data } = await api.post<AuthResponse>('/auth/login', {
          email,
          password,
        })
        setUser(data.user)
        await mergeGuestCart()
      },
      register: async (name, email, password) => {
        const { data } = await api.post<AuthResponse>('/auth/register', {
          name,
          email,
          password,
        })
        setUser(data.user)
        await mergeGuestCart()
      },
      loginWithUser: (next) => {
        setUser(next)
        void mergeGuestCart()
      },
      refreshUser,
      logout: async () => {
        await api.post('/auth/logout')
        setUser(null)
      },
    }),
    [user, loading, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
