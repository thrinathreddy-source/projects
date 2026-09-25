'use client'

import { useEffect } from 'react'
import { captureReferralFromUrl } from '@/lib/clientReferral'

/** Mounted once in the root layout — no UI, just records `?ref=` on arrival. */
export function ReferralCapture() {
  useEffect(() => {
    captureReferralFromUrl()
  }, [])
  return null
}
