import { useEffect, useState } from 'react'
import { fetchEmergencyFacilities } from '../../data/api/facilitiesApi'
import type { DatasetResult, EmergencyFacility } from '../../data/contracts'

export interface UseEmergencyFacilitiesResult {
  data?: DatasetResult<EmergencyFacility>
  isLoading: boolean
  error?: string
}

export function useEmergencyFacilities(postcode: string): UseEmergencyFacilitiesResult {
  const [data, setData] = useState<DatasetResult<EmergencyFacility>>()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(undefined)

    fetchEmergencyFacilities(postcode)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load emergency facility information.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [postcode])

  return { data, isLoading, error }
}
