import { HandHeart, MapTrifold, WifiHigh } from '@phosphor-icons/react'
import { enabledMapPlaceKinds, mapPlaceKindPresentation } from '../model/mapPlacePresentation'
import type { MapPlaceKind } from '../model/mapTypes'

function FilterIcon({ kind }: { kind: MapPlaceKind }) {
  return kind === 'wifi'
    ? <WifiHigh aria-hidden="true" size={20} weight="duotone" />
    : <HandHeart aria-hidden="true" size={20} weight="duotone" />
}

interface MapFiltersProps {
  selectedKinds: MapPlaceKind[]
  onChooseAll: () => void
  onToggleKind: (kind: MapPlaceKind) => void
}

export function MapFilters({ selectedKinds, onChooseAll, onToggleKind }: MapFiltersProps) {
  const allSelected = selectedKinds.length === enabledMapPlaceKinds.length

  return (
    <div className="unified-map-filters" aria-label="Place categories" role="group">
      <button className={allSelected ? 'filter-chip is-active' : 'filter-chip'} aria-pressed={allSelected} type="button" onClick={onChooseAll}>
        <MapTrifold aria-hidden="true" size={20} /> All
      </button>
      {enabledMapPlaceKinds.map((kind) => {
        const active = !allSelected && selectedKinds.includes(kind)
        return (
          <button className={active ? 'filter-chip is-active' : 'filter-chip'} aria-pressed={active} key={kind} type="button" onClick={() => onToggleKind(kind)}>
            <FilterIcon kind={kind} /> {mapPlaceKindPresentation[kind].label}
          </button>
        )
      })}
    </div>
  )
}
