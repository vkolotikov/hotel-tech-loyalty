import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { OverviewButton, OverviewDialog } from '../overview/OverviewUI'
import { useLook } from '../lib/look'
import { useRedesignWords } from '../redesign/words'
import { useEditorWords } from './words'
import { editorAssets, type EditorIconName } from './assets'
import './editors.css'

/** The settings editors share native focus, Escape and background inertness with the workspace. */
export function EditorDialog({ title, section, area, icon, wide = false, busy, onClose, children, tone = 'cyan' }: {
  title: string; section: string; area?: 'program' | 'options' | 'rewards'; icon: EditorIconName; wide?: boolean; busy?: boolean; onClose: () => void; children: ReactNode; tone?: 'cyan' | 'gold' | 'violet'
}) {
  const look = useLook()
  const { t } = useTranslation()
  return <div data-loyalty="" data-overview="" data-redesign="" data-theme={look.resolved} className="l-rd-dialog-root">
    <OverviewDialog title={title} focusContent kind="form" onClose={onClose} busy={busy} className={`l-editor-dialog ${wide ? 'l-editor-wide' : ''}`} heading={<div className="l-editor-heading" data-tone={tone}><EditorIcon name={icon} /><span>{area && <>{t(`loyalty.nav.${area}`)} / </>}{section}</span></div>}>
      {children}
    </OverviewDialog>
  </div>
}
export function EditorIcon({ name }: { name: EditorIconName }) { return <span className="l-editor-icon" aria-hidden><img src={editorAssets[name]} width={22} height={22} alt="" /></span> }
export function EditorSection({ icon, title, children }: { icon?: EditorIconName; title: string; children?: ReactNode }) {
  return <section className="l-editor-section"><h3>{icon && <EditorIcon name={icon} />}{title}</h3>{children}</section>
}
export function EditorNote({ icon = 'coin', title, children }: { icon?: EditorIconName; title: string; children?: ReactNode }) {
  return <div className="l-editor-note"><EditorIcon name={icon} /><div><strong>{title}</strong>{children && <div>{children}</div>}</div></div>
}
export function EditorDisclosure({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="l-editor-disclosure" open={open || undefined}><summary>{title}</summary><div>{children}</div></details>
}
export function EditorPreview({ children, tone = 'cyan' }: { children: ReactNode; tone?: 'cyan' | 'gold' | 'violet' }) {
  const say = useEditorWords(), rd = useRedesignWords()
  return <aside data-member-preview="" className="l-editor-preview" data-tone={tone}><header><span>{rd('memberPreview')}</span><small>{say('example')}</small></header>{children}</aside>
}
export function EditorArt({ kind, label, title, line }: { kind: 'levelArt' | 'earnArt' | 'rewardArt' | 'perkArt' | 'offerArt'; label: string; title: ReactNode; line?: ReactNode }) {
  return <div className="l-editor-art"><div><small>{label}</small><strong>{title}</strong>{line && <p>{line}</p>}</div><img src={editorAssets[kind]} alt="" /></div>
}
export function EditorSwitch({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  const id = useId()
  return <div className="l-editor-switch"><div><span id={id}>{label}</span>{hint && <small id={`${id}-hint`}>{hint}</small>}</div><button type="button" role="switch" aria-checked={checked} aria-labelledby={id} aria-describedby={hint ? `${id}-hint` : undefined} disabled={disabled} onClick={() => onChange(!checked)} /></div>
}
export function EditorFooter({ onCancel, busy = false, dirty = false, creating = false, save, disabled, canSave = true, children }: {
  onCancel: () => void; busy?: boolean; dirty?: boolean; creating?: boolean; save: string; disabled?: boolean; canSave?: boolean; children?: ReactNode
}) {
  const { t } = useTranslation(), say = useEditorWords(), rd = useRedesignWords()
  return <footer className="l-editor-footer"><small className="l-editor-draft" data-dirty={dirty || undefined}>{dirty ? rd('unsaved') : say(creating ? 'draft' : 'savedSettings')}</small>{children}<OverviewButton type="button" disabled={busy} onClick={onCancel}>{t('loyalty.common.cancel', 'Cancel')}</OverviewButton>{canSave && <OverviewButton type="submit" primary disabled={busy || disabled} aria-busy={busy}>{save}</OverviewButton>}</footer>
}

