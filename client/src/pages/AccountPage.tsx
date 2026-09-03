import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { startRegistration } from '@simplewebauthn/browser'
import { useAuth } from '../hooks/useAuth'
import { api, getErrorMessage } from '../lib/api'

type Passkey = {
  id: string
  deviceType: string | null
  backedUp: boolean
  createdAt: string
}

export function AccountPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)

  const passkeysQuery = useQuery({
    queryKey: ['passkeys'],
    queryFn: async () =>
      (await api.get<{ items: Passkey[] }>('/auth/webauthn/credentials')).data,
  })

  async function registerPasskey() {
    setError('')
    setMessage('')
    setPending(true)
    try {
      const { data: options } = await api.post('/auth/webauthn/register/options')
      const attestation = await startRegistration({ optionsJSON: options })
      await api.post('/auth/webauthn/register/verify', attestation)
      setMessage('Passkey saved. You can use Windows Hello, Touch ID, or a security key next time.')
      await queryClient.invalidateQueries({ queryKey: ['passkeys'] })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">Account</h1>
      <p className="mt-2 text-sm text-stone-600">
        {user?.name} · {user?.email}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-stone-50 p-3">
          <dt className="text-stone-500">Password</dt>
          <dd>{user?.hasPassword ? 'Set' : 'Not set (Google / passkey)'}</dd>
        </div>
        <div className="rounded-lg bg-stone-50 p-3">
          <dt className="text-stone-500">Google</dt>
          <dd>{user?.hasGoogle ? 'Linked' : 'Not linked'}</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-lg font-medium">Passkeys (WebAuthn)</h2>
      <p className="mt-1 text-sm text-stone-500">
        This uses the free WebAuthn standard in your browser. On Windows it often
        opens Windows Hello; on a phone it can use Face ID / fingerprint. No paid
        vendor and no extra ToS beyond your OS/browser.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => void registerPasskey()}
        className="mt-4 rounded-lg bg-ticket px-4 py-2 text-sm font-medium text-white hover:bg-ticket-dark disabled:opacity-60"
      >
        {pending ? 'Waiting for authenticator…' : 'Register this device'}
      </button>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-green-700">{message}</p> : null}

      <ul className="mt-4 space-y-2 text-sm">
        {(passkeysQuery.data?.items ?? []).map((item) => (
          <li key={item.id} className="rounded-lg border border-stone-200 px-3 py-2">
            {item.deviceType ?? 'passkey'} · {new Date(item.createdAt).toLocaleString()}
            {item.backedUp ? ' · backed up' : ''}
          </li>
        ))}
        {passkeysQuery.data?.items.length === 0 ? (
          <li className="text-stone-500">No passkeys yet.</li>
        ) : null}
      </ul>
    </div>
  )
}
