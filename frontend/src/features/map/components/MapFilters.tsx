import { MapTrifold, WifiHigh } from '@phosphor-icons/react'
import { supportServiceFilters, type MapResultFilter } from '../model/supportServiceFilters'

interface MapFiltersProps {
  filter: MapResultFilter
  onSelect: (filter: MapResultFilter) => void
}

export function MapFilters({ filter, onSelect }: MapFiltersProps) {
  return (
    <div className="unified-map-filters" aria-label="Place categories" role="group">
      <button
        className={filter.mode === 'all' ? 'filter-chip is-active' : 'filter-chip'}
        aria-pressed={filter.mode === 'all'}
        type="button"
        onClick={() => onSelect({ mode: 'all' })}
      >
        <MapTrifold aria-hidden="true" size={20} /> All
      </button>
      <button
        className={filter.mode === 'wifi' ? 'filter-chip is-active' : 'filter-chip'}
        aria-pressed={filter.mode === 'wifi'}
        type="button"
        onClick={() => onSelect({ mode: 'wifi' })}
      >
        <WifiHigh aria-hidden="true" size={20} weight="duotone" /> Free Wi-Fi
      </button>
      {supportServiceFilters.map((item) => {
        const active = filter.mode === 'tag' && filter.serviceType === item.serviceType
        return (
          <button
            className={active ? 'filter-chip is-active' : 'filter-chip'}
            aria-pressed={active}
            key={item.id}
            type="button"
            onClick={() => onSelect({ mode: 'tag', serviceType: item.serviceType })}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
