import { useEffect, useState } from 'react'
import { DesignDialog } from '../redesign/DesignUI'
import { OverviewButton } from '../overview/OverviewUI'
import { useRedesignWords } from '../redesign/words'
import { useEditorWords } from './words'

/** A cancelled draft stays mounted, including any validation errors, until staff explicitly discard it. */
export function useEditorClose(value: unknown, onClose: () => void, busy = false) {
  const [baseline] = useState(() => JSON.stringify(value)), [discard, setDiscard] = useState(false)
  const dirty = JSON.stringify(value) !== baseline
  const rd = useRedesignWords(), say = useEditorWords()
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  return { dirty, cancel: () => { if (busy) return; if (dirty) setDiscard(true); else onClose() }, warning: discard && <DesignDialog title={say('discardTitle')} onClose={() => setDiscard(false)} busy={busy}><div className="l-rd-form"><p>{say('discardLine')}</p><div className="l-rd-actions"><OverviewButton onClick={() => setDiscard(false)}>{rd('keepEditing')}</OverviewButton><OverviewButton primary onClick={onClose}>{rd('discard')}</OverviewButton></div></div></DesignDialog> }
}
