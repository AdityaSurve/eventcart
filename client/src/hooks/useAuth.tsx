import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, getToken, setToken } from '../lib/api'
import type { AuthResponse, User } from '../types'

type AuthContextValue = {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setTokenState] = useState<string | null>(getToken())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadUser() {
      if (!token) {
        setUser(null)
        setLoading(false)
        return
      }

      try {
        const { data } = await api.get<User>('/auth/me')
        setUser(data)
      } catch {
        setToken(null)
        setTokenState(null)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    void loadUser()
  }, [token])

  async function applyAuth(response: AuthResponse) {
    setToken(response.accessToken)
    setTokenState(response.accessToken)
    setUser(response.user)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      login: async (email, password) => {
        const { data } = await api.post<AuthResponse>('/auth/login', {
          email,
          password,
        })
        await applyAuth(data)
      },
      register: async (name, email, password) => {
        const { data } = await api.post<AuthResponse>('/auth/register', {
          name,
          email,
          password,
        })
        await applyAuth(data)
      },
      logout: () => {
        setToken(null)
        setTokenState(null)
        setUser(null)
      },
    }),
    [user, token, loading],
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
