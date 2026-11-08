import type { SelectHTMLAttributes } from 'react'
import { CONTROL } from '../ui/inputs'

const INLINE = CONTROL.replace('w-full', 'w-auto max-w-full')

/** A list box as wide as its choices (in a toolbar or a row), in the look of every other one. */
export function InlineSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${INLINE} ${props.className ?? ''}`} />
}
