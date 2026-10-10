import { Trash, Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { PageBackLink } from '../../../shared/components/PageBackLink'
import { clearAllLocalData } from '../../../storage/clearAllLocalData'

export function DeleteProfilePage() {
  const [status, setStatus] = useState<'idle' | 'deleting' | 'deleted'>('idle')

  async function deleteEverything() {
    setStatus('deleting')
    await clearAllLocalData()
    setStatus('deleted')
  }

  if (status === 'deleted') {
    return <section className="flow-page setup-complete" aria-labelledby="deleted-title"><div className="success-symbol"><Trash aria-hidden="true" size={38} weight="duotone" /></div><h1 id="deleted-title">Everything saved on this device was deleted</h1><p className="lead">Your household notes, My area, crisis pack, checklist ticks, saved places, saved support services, the nearby services list and saved routes have been removed.</p><Link className="button button--primary" to={appRoutes.home}>Return home</Link></section>
  }
  return (
    <section className="flow-page delete-page" aria-labelledby="delete-title">
      <PageBackLink to={appRoutes.settings}>Cancel and return to profile</PageBackLink>
      <h1 id="delete-title">Delete everything saved on this device?</h1>
      <div className="delete-explanation"><Warning aria-hidden="true" size={24} /><p>This permanently removes your household notes, consent choices, My area, search area, crisis pack, checklist ticks, saved places, the saved support services list, the nearby services list and saved routes from this device. This cannot be undone.</p></div>
      <div className="detail-actions detail-actions--bottom"><button className="button button--danger" type="button" disabled={status === 'deleting'} onClick={() => void deleteEverything()}><Trash aria-hidden="true" size={19} /> {status === 'deleting' ? 'Deleting…' : 'Delete everything saved on this device'}</button><Link className="button button--quiet" to={appRoutes.settings}>Cancel</Link></div>
    </section>
  )
}
