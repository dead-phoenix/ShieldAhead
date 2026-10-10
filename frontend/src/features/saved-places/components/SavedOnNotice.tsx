import { formatSavedDate } from '../../../shared/utils/formatDate'
import '../SavedPlaces.css'

export function SavedOnNotice({ savedAt }: { savedAt: string }) {
  return (
    <p className="inline-status saved-place-notice" role="note">
      Saved on {formatSavedDate(savedAt)}. Details may have changed. Check before you go.
    </p>
  )
}
