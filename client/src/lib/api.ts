import axios, { isAxiosError } from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  withCredentials: true,
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
