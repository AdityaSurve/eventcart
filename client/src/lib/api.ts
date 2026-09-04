import axios, { isAxiosError } from 'axios'

const GUEST_ID_KEY = 'eventcart_guest_id'

export function getGuestId() {
  let id = localStorage.getItem(GUEST_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(GUEST_ID_KEY, id)
  }
  return id
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  config.headers.set('X-Guest-Id', getGuestId())
  return config
})

export function getErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined
    if (Array.isArray(data?.message)) {
      return data.message.join(', ')
    }
    if (typeof data?.message === 'string') {
      return data.message
    }
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong'
}

export function apiOrigin() {
  return import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
}

export function rememberGuestOrder(orderId: string, guestEmail: string) {
  localStorage.setItem(`eventcart_guest_order:${orderId}`, guestEmail)
}

export function guestEmailForOrder(orderId: string) {
  return localStorage.getItem(`eventcart_guest_order:${orderId}`)
}
