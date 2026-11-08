import { useTranslation } from 'react-i18next'
import { Send } from 'lucide-react'
import { resolveImage } from '../../lib/api'
import { LAUNCHER_ICON } from './icons'
import { previewColours, type WidgetForm } from './widgetForm'

const LAUNCHER_RADIUS: Record<WidgetForm['launcher_shape'], string> = {
  circle: '9999px',
  'rounded-square': '28%',
  pill: '9999px',
  square: '6px',
}

/**
 * A sketch of the chat on a website, in the colours and words chosen (not the widget itself): the window with its
 * header, a welcome, a question and an answer, and the launcher in its corner. The colours are the visitor-facing
 * ones the venue picked, so they are drawn inline; the frame around them stays on the workspace's tokens.
 */
export function WidgetPreview({ form }: { form: WidgetForm }) {
  const { t } = useTranslation()
  const c = previewColours(form)
  const Icon = LAUNCHER_ICON[form.launcher_icon]
  const radius = `${form.border_radius}px`
  const left = form.position === 'bottom-left'
  const avatar = form.assistant_avatar_url ? resolveImage(form.assistant_avatar_url) : null
  const title = form.header_title || form.company_name || t('crm.widget.preview.title', 'Chat with us')
  const status = { online: t('crm.widget.status.online', 'Online'), away: t('crm.widget.status.away', 'Away'), offline: t('crm.widget.status.offline', 'Offline') }[form.agent_status]

  return (
    <figure aria-label={t('crm.widget.preview.label', 'Preview of the chat on your website')} className="rounded-2xl border border-a-border bg-a-surface-2 p-4">
      <div className={`flex flex-col gap-3 ${left ? 'items-start' : 'items-end'}`} style={{ fontFamily: `${form.font_family}, system-ui, sans-serif` }}>
        <div className="w-full max-w-xs overflow-hidden shadow-a-lg" style={{ borderRadius: radius, background: c.background }}>
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: c.header, color: c.headerText }}>
            {avatar
              ? <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
              : <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.22)' }}>{title.slice(0, 1).toUpperCase()}</span>}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{title}</span>
              <span className="block truncate text-xs opacity-85">{form.header_subtitle || status}</span>
            </span>
          </div>
          <div className="space-y-2 px-3 py-3">
            {(form.welcome_title || form.welcome_subtitle) && (
              <div className="text-center" style={{ color: c.botText }}>
                {form.welcome_title && <p className="text-sm font-semibold">{form.welcome_title}</p>}
                {form.welcome_subtitle && <p className="text-xs opacity-80">{form.welcome_subtitle}</p>}
              </div>
            )}
            <p className="max-w-[85%] px-3 py-2 text-xs" style={{ background: c.bot, color: c.botText, borderRadius: radius }}>
              {form.welcome_message || t('crm.widget.preview.hello', 'Hello! How can I help you today?')}
            </p>
            <p className="ml-auto max-w-[85%] px-3 py-2 text-xs" style={{ background: c.user, color: c.userText, borderRadius: radius }}>
              {t('crm.widget.preview.question', 'Can I book for Friday afternoon?')}
            </p>
            {form.show_suggestions && form.suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.suggestions.slice(0, 3).map(s => (
                  <span key={s} className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: c.primary, color: c.primary }}>{s}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t px-3 py-2" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
            <span className="min-w-0 flex-1 truncate text-xs" style={{ color: c.botText, opacity: 0.6 }}>{form.input_placeholder || t('crm.widget.preview.placeholder', 'Type a message…')}</span>
            <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full" style={{ background: c.primary, color: '#ffffff' }}><Send size={13} /></span>
          </div>
          {form.show_branding && (
            <p className="pb-2 text-center text-xs" style={{ color: c.botText, opacity: 0.5 }}>{form.branding_text || t('crm.widget.preview.branding', 'Powered by your business')}</p>
          )}
        </div>
        <span aria-hidden className="grid place-items-center shadow-a-lg"
          style={{
            width: form.launcher_shape === 'pill' ? form.launcher_size * 1.8 : form.launcher_size,
            height: form.launcher_size,
            borderRadius: LAUNCHER_RADIUS[form.launcher_shape],
            background: c.primary,
            color: '#ffffff',
          }}>
          <Icon size={Math.round(form.launcher_size * 0.42)} />
        </span>
      </div>
    </figure>
  )
}
