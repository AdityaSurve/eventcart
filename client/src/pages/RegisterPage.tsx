import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { apiOrigin, getErrorMessage } from '../lib/api'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      await register(name, email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">Create account</h1>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm">
          Name
          <input
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
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
          {pending ? 'Creating…' : 'Register'}
        </button>
      </form>
      <a
        href={`${apiOrigin()}/auth/google`}
        className="mt-3 block w-full rounded-lg border border-stone-300 py-2.5 text-center text-sm font-medium hover:bg-stone-50"
      >
        Continue with Google
      </a>
      <p className="mt-4 text-sm text-stone-600">
        Already have an account?{' '}
        <Link className="text-ticket" to="/login">
          Log in
        </Link>
      </p>
    </div>
  )
}
