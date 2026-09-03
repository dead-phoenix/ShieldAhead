import type { DatasetMetadata } from '../../../data/contracts'

interface SupportDatasetDisclosureProps {
  metadata: DatasetMetadata
}

export function SupportDatasetDisclosure({ metadata }: SupportDatasetDisclosureProps) {
  return (
    <details className="dataset-disclosure">
      <summary>About this information</summary>
      <div>
        <p><strong>Source:</strong> {metadata.sourceName}</p>
        {metadata.coverageAreas.length > 0 ? (
          <p><strong>Coverage:</strong> {metadata.coverageAreas.join(', ')}</p>
        ) : null}
        {metadata.limitations.length > 0 ? (
          <>
            <strong>Important limitations:</strong>
            <ul>
              {metadata.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
            </ul>
          </>
        ) : null}
      </div>
    </details>
  )
}
