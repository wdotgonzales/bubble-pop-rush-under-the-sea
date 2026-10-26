import { useState } from 'react'
import { describeError } from '../diagnostics'
import { createServices, type Services } from '../services'

interface ServicesResult {
  services: Services | null
  error: string | null
}

/** Create the platform, API and session once. A failure is reported, not thrown. */
export function useServices(): ServicesResult {
  const [result] = useState<ServicesResult>(() => {
    try {
      return { services: createServices(), error: null }
    } catch (error) {
      return { services: null, error: describeError(error) }
    }
  })
  return result
}
