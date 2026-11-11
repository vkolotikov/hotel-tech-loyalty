import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/** Default to still UI until the platform preference is known. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(true)
  useEffect(() => {
    let live = true
    let changed = false
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; setReduce(value) })
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live && !changed) setReduce(value) }).catch(() => {})
    return () => { live = false; sub.remove() }
  }, [])
  return reduce
}
