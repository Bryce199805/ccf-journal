export async function apiGet<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL('/api' + path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v != null && v !== undefined) url.searchParams.set(k, String(v))
    })
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

export async function apiDelete<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}
