import { Ambulance, Fire, HandHeart, Hospital, MapTrifold, ShieldCheckered, WifiHigh } from '@phosphor-icons/react'
import { enabledMapPlaceKinds, mapPlaceKindPresentation } from '../model/mapPlacePresentation'
import type { MapPlaceKind } from '../model/mapTypes'

function FilterIcon({ kind }: { kind: MapPlaceKind }) {
  if (kind === 'wifi') return <WifiHigh aria-hidden="true" size={20} weight="duotone" />
  if (kind === 'support') return <HandHeart aria-hidden="true" size={20} weight="duotone" />
  if (kind === 'hospital') return <Hospital aria-hidden="true" size={20} weight="duotone" />
  if (kind === 'police') return <ShieldCheckered aria-hidden="true" size={20} weight="duotone" />
  if (kind === 'fire') return <Fire aria-hidden="true" size={20} weight="duotone" />
  return <Ambulance aria-hidden="true" size={20} weight="duotone" />
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
