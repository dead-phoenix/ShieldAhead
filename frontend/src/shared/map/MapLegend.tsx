interface MapLegendItem {
  label: string
  variant: 'confirmed' | 'likely' | 'support' | 'hospital' | 'police' | 'fire' | 'ambulance'
}

interface MapLegendProps {
  items: MapLegendItem[]
}

export function MapLegend({ items }: MapLegendProps) {
  return (
    <ul className="map-legend" aria-label="Map key">
      {items.map((item) => (
        <li key={item.variant}>
          <span aria-hidden="true" className={`map-legend__symbol map-legend__symbol--${item.variant}`} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
