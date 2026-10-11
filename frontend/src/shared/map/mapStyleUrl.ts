export const defaultMapStyleUrl = 'https://tiles.openfreemap.org/styles/liberty'

export function resolveMapStyleUrl(): string {
  return import.meta.env.VITE_MAP_STYLE_URL?.trim() || defaultMapStyleUrl
}
