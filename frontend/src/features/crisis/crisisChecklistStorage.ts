import { storageKeys } from '../../app/config/product'

export type CrisisChecklistState = Record<string, boolean>

export function readCrisisChecklist(kind: string): CrisisChecklistState {
  try {
    const stored = window.localStorage.getItem(`${storageKeys.crisisChecklist}.${kind}`)
    return stored ? JSON.parse(stored) as CrisisChecklistState : {}
  } catch {
    return {}
  }
}

export function saveCrisisChecklist(kind: string, state: CrisisChecklistState) {
  window.localStorage.setItem(`${storageKeys.crisisChecklist}.${kind}`, JSON.stringify(state))
}
