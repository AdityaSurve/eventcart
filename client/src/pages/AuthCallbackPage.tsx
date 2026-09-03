import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function AuthCallbackPage() {
  const { refreshUser } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    async function finish() {
      await refreshUser()
      navigate('/', { replace: true })
    }

    void finish()
  }, [navigate, refreshUser])

  return <p className="text-stone-500">Finishing sign-in…</p>
}
