import type { MyArea } from '../../data/contracts'
import { LocationSearchFields } from '../../features/location/components/LocationSearchFields'
import { saveMyArea } from '../../storage/myAreaStorage'

interface MyAreaInlineEditorProps {
  myArea: MyArea | null
  isEditorOpen: boolean
  onOpenEditor: () => void
  onSaved: (area: MyArea) => void
  /** e.g. "This pack and the Support map use" — the start of the "… <area>." sentence shown once an area is saved. */
  usesAreaText: string
  /** e.g. "Set your area so this pack and the Support map can find nearby help." */
  setAreaPrompt: string
  /** e.g. "Update the area this pack and the Support map use." */
  updateAreaPrompt: string
}

/** The "My area" block shared by the Crisis pack page and the Crisis hub page —
 * shows the saved area with an inline Change control, or the same location
 * search used on the Support map's location step when there is nothing saved yet. */
export function MyAreaInlineEditor({
  myArea,
  isEditorOpen,
  onOpenEditor,
  onSaved,
  usesAreaText,
  setAreaPrompt,
  updateAreaPrompt,
}: MyAreaInlineEditorProps) {
  return (
    <section className="my-area-inline" aria-labelledby="my-area-heading">
      <h2 id="my-area-heading">My area</h2>
      {myArea && !isEditorOpen ? (
        <p>
          {usesAreaText} <strong>{myArea.label}</strong>.{' '}
          <button className="button button--quiet" type="button" onClick={onOpenEditor}>Change</button>
        </p>
      ) : (
        <div className="my-area-inline__prompt">
          <p>{myArea ? updateAreaPrompt : setAreaPrompt}</p>
          <LocationSearchFields
            initialQuery={myArea?.postcode ?? ''}
            onResolved={(postcode, label) => {
              const saved = saveMyArea({ postcode, label })
              if (!saved) return false
              onSaved(saved)
              return true
            }}
          />
        </div>
      )}
    </section>
  )
}
