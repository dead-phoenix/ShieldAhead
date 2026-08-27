import { useCallback, useEffect, useState } from 'react'
import type { DatasetResult } from './contracts'

export function useRepositoryData<T>(
  load: () => Promise<DatasetResult<T>>,
): {
  data: DatasetResult<T> | null
  isLoading: boolean
  error: string
  retry: () => void
} {
  const [data, setData] = useState<DatasetResult<T> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [requestId, setRequestId] = useState(0)

  const retry = useCallback(() => {
    setError('')
    setIsLoading(true)
    setRequestId((current) => current + 1)
  }, [])

  useEffect(() => {
    let isCurrent = true

    load()
      .then((result) => {
        if (isCurrent) setData(result)
      })
      .catch(() => {
        if (isCurrent) {
          setError('Saved information could not be opened. Try again.')
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [load, requestId])

  return { data, isLoading, error, retry }
}
