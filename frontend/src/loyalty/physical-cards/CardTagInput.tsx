import { useState, type RefObject } from 'react'
import { Usb } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { useScanWords } from '../scan/design/words'
import { detectEnv, hexWithColons, modeState } from '../scan/scanMath'
import { UsbReader } from '../scan/UsbReader'
import { WindowsReader } from '../scan/WindowsReader'
import { usePhysicalCardWords } from './words'

export function CardTagInput({ value, onChange, inputRef, disabled, optional = false, currentUid }: {
  value: string
  onChange: (value: string) => void
  inputRef?: RefObject<HTMLInputElement | null>
  disabled: boolean
  optional?: boolean
  currentUid?: string | null
}) {
  const say = usePhysicalCardWords()
  const scan = useScanWords()
  const [usb, setUsb] = useState(false)
  const env = detectEnv()
  const windows = modeState('windows', env) === 'ready'
  const read = (uid: string) => {
    if (disabled) return false
    onChange(hexWithColons(uid))
  }

  return <div className="space-y-3">
    {windows && !usb && <WindowsReader onUid={read} />}
    {currentUid && <p className="text-sm text-a-text-2">{say('currentUid', { uid: hexWithColons(currentUid) })}</p>}
    <Field label={say(optional ? 'uidOptional' : 'uid')} hint={say(optional ? (currentUid ? 'keepTagHint' : 'issueHint') : 'readerHint')}>
      <input ref={inputRef} className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text"
        value={value} onChange={event => onChange(event.target.value)} maxLength={100}
        autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={disabled} />
    </Field>
    {env.webHid && <Button type="button" variant="ghost" size="sm" onClick={() => setUsb(value => !value)} aria-expanded={usb}>
      <Usb size={16} aria-hidden />{windows && usb ? scan('windowsUse') : say('readerOptions')}
    </Button>}
    {usb && <UsbReader onUid={read} />}
  </div>
}
