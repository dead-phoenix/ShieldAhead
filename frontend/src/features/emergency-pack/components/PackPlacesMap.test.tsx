import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CrisisPackPlacesMap } from '../buildCrisisPack'
import type { CrisisPackStreetMap } from '../useCrisisPackMap'
import { PackPlacesMap } from './PackPlacesMap'

function streetMap(overrides: Partial<CrisisPackStreetMap> = {}): CrisisPackStreetMap {
  return {
    placesKey: 'key',
    url: 'blob:street-map',
    createdAt: '2026-10-14T03:00:00.000Z',
    attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
    width: 1014,
    height: 634,
    positions: [
      { key: 'wifi:w-a', x: 507, y: 317 },
      { key: 'wifi:w-b', x: 300, y: 200 },
      { key: 'charity:c-a', x: 700, y: 450 },
    ],
    metersPerPixel: 2,
    ...overrides,
  }
}

function placesMap(overrides: Partial<CrisisPackPlacesMap> = {}): CrisisPackPlacesMap {
  return {
    points: [
      { id: 'w-a', kind: 'wifi', label: 'W1', latitude: -36.998, longitude: 144.263 },
      { id: 'w-b', kind: 'wifi', label: 'W2', latitude: -37.01, longitude: 144.25 },
      { id: 'c-a', kind: 'charity', label: 'C2', latitude: -37.02, longitude: 144.27 },
    ],
    visibleKinds: ['wifi', 'charity'],
    caption: 'Simplified map (no streets)',
    noRoomNote: 'Map left out: there is no room for it on this page.',
    noPointsNote: 'None of these places has a map location.',
    ...overrides,
  }
}

function mapImage() {
  return screen.getByRole('img', { name: /^Map of saved places/ })
}

describe('Crisis pack places map', () => {
  it('draws one labelled marker per place, circles for Wi-Fi and squares for charities, in a single SVG', () => {
    const { container } = render(<PackPlacesMap map={placesMap()} />)
    expect(mapImage()).toHaveAccessibleName('Map of saved places: W1, W2, C2')
    expect(container.querySelectorAll('svg.pack-places-map__svg')).toHaveLength(1)
    expect(mapImage().querySelectorAll('.pack-map-marker--wifi circle')).toHaveLength(2)
    expect(mapImage().querySelectorAll('.pack-map-marker--charity rect')).toHaveLength(1)
    expect([...mapImage().querySelectorAll('.pack-map-marker text')].map((text) => text.textContent)).toEqual(['W1', 'W2', 'C2'])
    expect(mapImage().querySelector('image')).toBeNull()
    expect(mapImage()).toHaveAttribute('viewBox', '0 0 1014 634')
  })

  it('adds a scale bar, a north arrow, a legend and the simplified-map caption', () => {
    render(<PackPlacesMap map={placesMap()} />)
    expect(mapImage().querySelector('.pack-map-scale text')?.textContent).toMatch(/^\d+ (m|km)$/)
    expect(within(mapImage()).getByText('N')).toBeInTheDocument()
    const caption = screen.getByText('Simplified map (no streets)').closest('figcaption') as HTMLElement
    expect(within(caption).getByText('Wi-Fi spot')).toBeInTheDocument()
    expect(within(caption).getByText('Charity')).toBeInTheDocument()
  })

  it('hides markers for a toggled-off kind without moving the others', () => {
    const { rerender } = render(<PackPlacesMap map={placesMap()} />)
    const position = () => mapImage().querySelector('.pack-map-marker--wifi circle')?.getAttribute('cx')
    const before = position()

    rerender(<PackPlacesMap map={placesMap({ visibleKinds: ['wifi'] })} />)
    expect(mapImage()).toHaveAccessibleName('Map of saved places: W1, W2')
    expect(mapImage().querySelector('.pack-map-marker--charity')).toBeNull()
    expect(position()).toBe(before)
    expect(screen.queryByText('Charity')).not.toBeInTheDocument()
  })

  it('shows a one-line note instead of a map when no visible place has a map location', () => {
    render(<PackPlacesMap map={placesMap({ points: [] })} />)
    expect(screen.getByText('None of these places has a map location.')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /^Map of saved places/ })).not.toBeInTheDocument()
  })

  it('carries the no-room note that CSS shows when the page has too little space left', () => {
    const { container } = render(<PackPlacesMap map={placesMap()} />)
    const slot = container.querySelector('.pack-places-map-slot') as HTMLElement
    expect(within(slot).getByText('Map left out: there is no room for it on this page.')).toHaveClass('pack-places-map__no-room')
  })

  it('puts the street picture inside the same SVG, behind the markers, lightened and desaturated for print', () => {
    const { container } = render(<PackPlacesMap map={placesMap()} streetMap={streetMap()} />)
    expect(container.querySelectorAll('svg')).toHaveLength(1 + container.querySelectorAll('.pack-places-map__legend-glyph').length)
    const image = mapImage().querySelector('image') as SVGImageElement
    expect(image).toHaveAttribute('href', 'blob:street-map')
    expect(image).toHaveAttribute('width', '1014')
    expect(image).toHaveAttribute('height', '634')
    expect(image).toHaveAttribute('opacity', '0.55')

    const filterId = image.getAttribute('filter')?.match(/^url\(#(.+)\)$/)?.[1] as string
    const matrix = mapImage().querySelector(`filter[id="${filterId}"] feColorMatrix`)
    expect(matrix).toHaveAttribute('type', 'saturate')
    expect(matrix).toHaveAttribute('values', '0.35')

    const firstMarker = mapImage().querySelector('.pack-map-marker') as Element
    expect(image.compareDocumentPosition(firstMarker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('places markers at the stored map positions and sizes the scale bar from the stored metres per pixel', () => {
    render(<PackPlacesMap map={placesMap()} streetMap={streetMap()} />)
    const circles = [...mapImage().querySelectorAll('.pack-map-marker--wifi circle')]
    expect(circles.map((circle) => [circle.getAttribute('cx'), circle.getAttribute('cy')])).toEqual([['507', '317'], ['300', '200']])
    const square = mapImage().querySelector('.pack-map-marker--charity rect') as Element
    expect(Number(square.getAttribute('x')) + Number(square.getAttribute('width')) / 2).toBeCloseTo(700)
    expect(mapImage().querySelector('.pack-map-scale text')?.textContent).toBe('200 m')
    expect(mapImage().querySelector('.pack-map-scale path')?.getAttribute('d')).toContain('H 124')
  })

  it('prints the tile attribution in the bottom-right corner on a white box, and dates the map in the caption', () => {
    render(<PackPlacesMap map={placesMap()} streetMap={streetMap()} />)
    const attribution = mapImage().querySelector('.pack-map-attribution') as SVGGElement
    expect(within(attribution as unknown as HTMLElement).getByText('© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors')).toBeInTheDocument()
    const box = attribution.querySelector('rect') as SVGRectElement
    expect(box).toHaveAttribute('fill', '#fff')
    expect(Number(box.getAttribute('x')) + Number(box.getAttribute('width'))).toBeCloseTo(1012)
    expect(Number(box.getAttribute('y')) + Number(box.getAttribute('height'))).toBeCloseTo(632)
    expect(Number(attribution.querySelector('text')?.getAttribute('font-size'))).toBe(18)

    expect(screen.getByText('Street map made 14 October 2026')).toBeInTheDocument()
    expect(screen.queryByText('Simplified map (no streets)')).not.toBeInTheDocument()
  })

  it('shrinks a long attribution so it never runs into the scale bar', () => {
    render(<PackPlacesMap map={placesMap()} streetMap={streetMap({ attribution: 'x'.repeat(200) })} />)
    const box = mapImage().querySelector('.pack-map-attribution rect') as SVGRectElement
    expect(Number(box.getAttribute('x'))).toBeGreaterThanOrEqual(24 + 180)
  })

  it('falls back to the simplified map when the street map does not cover every place', () => {
    render(<PackPlacesMap map={placesMap()} streetMap={streetMap({ positions: [{ key: 'wifi:w-a', x: 507, y: 317 }] })} />)
    expect(mapImage().querySelector('image')).toBeNull()
    expect(screen.getByText('Simplified map (no streets)')).toBeInTheDocument()
  })

  it('adds the muted note when the street map could not be made, and only then', () => {
    const { rerender } = render(<PackPlacesMap map={placesMap()} streetMapFailed />)
    expect(screen.getByText('Street map unavailable. Simplified map shown.')).toHaveClass('pack-places-map__status')
    expect(mapImage().querySelector('image')).toBeNull()

    rerender(<PackPlacesMap map={placesMap()} />)
    expect(screen.queryByText('Street map unavailable. Simplified map shown.')).not.toBeInTheDocument()
  })
})
