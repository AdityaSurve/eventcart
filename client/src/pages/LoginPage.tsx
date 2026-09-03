import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { startAuthentication } from '@simplewebauthn/browser'
import { useAuth } from '../hooks/useAuth'
import { api, apiOrigin, getErrorMessage } from '../lib/api'
import type { AuthResponse } from '../types'

export function LoginPage() {
  const { login, loginWithUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [email, setEmail] = useState('customer@test.com')
  const [password, setPassword] = useState('TestPass123')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  async function onPasskey() {
    setError('')
    setPending(true)
    try {
      const { data: options } = await api.post('/auth/webauthn/login/options', {
        email,
      })
      const assertion = await startAuthentication({ optionsJSON: options })
      const { data } = await api.post<AuthResponse>('/auth/webauthn/login/verify', {
        email,
        response: assertion,
      })
      loginWithUser(data.user)
      navigate(from, { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <p className="mt-1 text-sm text-stone-500">
        Seed accounts: customer@test.com / admin@test.com
      </p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm">
          Email
          <input
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-ticket py-2.5 font-medium text-white hover:bg-ticket-dark disabled:opacity-60"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="mt-4 space-y-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void onPasskey()}
          className="w-full rounded-lg border border-stone-300 py-2.5 text-sm font-medium hover:bg-stone-50 disabled:opacity-60"
        >
          Sign in with passkey / Windows Hello
        </button>
        <a
          href={`${apiOrigin()}/auth/google`}
          className="block w-full rounded-lg border border-stone-300 py-2.5 text-center text-sm font-medium hover:bg-stone-50"
        >
          Continue with Google
        </a>
      </div>
      <p className="mt-4 text-sm text-stone-600">
        No account?{' '}
        <Link className="text-ticket" to="/register">
          Register
        </Link>
      </p>
    </div>
  )
}
