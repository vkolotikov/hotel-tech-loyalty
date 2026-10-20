import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { resetAfterCopied } from './copyReset'

/**
 * Copies `text` (a short link, a page's address) and says so; where the browser refuses the clipboard (an insecure
 * page, a denied permission) it says to copy the text by hand. The status line is read out by screen readers.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation()
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => resetAfterCopied(state, () => setState('idle')), [state])
  const copy = () => {
    // navigator.clipboard is missing on an insecure page: that throw becomes the refusal too.
    void Promise.resolve().then(() => navigator.clipboard.writeText(text)).then(() => setState('copied'), () => setState('failed'))
  }
  const copied = t('content.common.copied', 'Copied')
  return (
    <>
      <Button size="sm" variant="secondary" onClick={copy}><Copy size={14} aria-hidden />{state === 'copied' ? copied : label}</Button>
      <span role="status" className={state === 'failed' ? 'text-xs text-a-danger' : 'sr-only'}>
        {state === 'failed' ? t('content.common.copy_failed', 'Could not copy. Select the text and copy it yourself.') : state === 'copied' ? copied : ''}
      </span>
    </>
  )
}
