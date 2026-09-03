export function resolveApiUrl(baseUrl: string, path: string, postcode: string): URL {
  const configuredOrigin = baseUrl.trim().replace(/\/$/, '')
  const origin = configuredOrigin || (typeof window === 'undefined' ? '' : window.location.origin)
  if (!origin) {
    throw new Error('VITE_API_BASE_URL is required when VITE_DATA_SOURCE=api.')
  }

  const url = new URL(path, `${origin}/`)
  url.searchParams.set('postcode', postcode)
  return url
}
