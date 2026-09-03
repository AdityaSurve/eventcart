import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io, Socket } from 'socket.io-client'
import { useAuth } from './useAuth'
import { apiOrigin } from '../lib/api'

export function useOrderRealtime() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!user) return

    const socket: Socket = io(apiOrigin(), {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    })

    socket.on('order.updated', (payload: { orderId?: string }) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      if (payload.orderId) {
        void queryClient.invalidateQueries({ queryKey: ['order', payload.orderId] })
      }
    })

    return () => {
      socket.disconnect()
    }
  }, [user, queryClient])
}
