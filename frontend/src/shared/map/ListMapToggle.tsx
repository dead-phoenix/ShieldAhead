import { ListBullets, MapTrifold } from '@phosphor-icons/react'

export type ResultsView = 'list' | 'map'

interface ListMapToggleProps {
  value: ResultsView
  onChange: (view: ResultsView) => void
  mapDisabled?: boolean
}

export function ListMapToggle({ value, onChange, mapDisabled = false }: ListMapToggleProps) {
  return (
    <div className="view-toggle" aria-label="Choose results view">
      <button
        aria-pressed={value === 'list'}
        className={value === 'list' ? 'is-active' : undefined}
        type="button"
        onClick={() => onChange('list')}
      >
        <ListBullets aria-hidden="true" size={18} />
        List
      </button>
      <button
        aria-pressed={value === 'map'}
        className={value === 'map' ? 'is-active' : undefined}
        disabled={mapDisabled}
        title={mapDisabled ? 'The map needs an internet connection' : undefined}
        type="button"
        onClick={() => onChange('map')}
      >
        <MapTrifold aria-hidden="true" size={18} />
        Map
      </button>
    </div>
  )
}
