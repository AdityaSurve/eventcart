export function productImage(slug: string, imageUrl?: string | null) {
  if (imageUrl) return imageUrl
  return `https://picsum.photos/seed/${encodeURIComponent(slug)}/800/600`
}

export function statusTone(status: string) {
  if (status === 'DELIVERED' || status === 'PAID' || status === 'CONFIRMED') {
    return 'ok'
  }
  if (status === 'CANCELLED' || status === 'FAILED') {
    return 'bad'
  }
  if (status === 'SHIPPED' || status === 'PREPARING' || status === 'PENDING') {
    return 'warn'
  }
  return undefined
}
