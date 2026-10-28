import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { FormField } from '../ui/formParts'
import { blockId, moveBlock, newBlock, patchBlock, removeBlock, type TagField } from './campaignsMath'
import type { TagFieldProps } from './TagBar'
import type { Align, Block, CampaignOptions } from './types'
import { ALIGN_WORDS, BLOCK_WORDS, DRAFT_PROBLEM_WORDS, LEVEL_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'
const ICON = 'rounded p-1.5 text-a-text-2 hover:text-a-text disabled:opacity-40'

/**
 * The email's body as blocks (spec 2026-10-21 release 2 §6), in the full admin's builder format: a heading (its words,
 * size and alignment), text, a button (its label and link), a divider, a space. Each moves up or down or goes; the
 * kinds, sizes and a new block's look are the server's (CampaignBody::options). Colours are kept as they are: a
 * block made in the full admin keeps its own. A heading's, a text's and a button label's field tells the editor where
 * its cursor is (`track`), so the tag bar can put a tag there.
 */
export function BlockList({ blocks, options, problems, onChange, track, fieldsOnly = false }: {
  blocks: Block[]
  options: CampaignOptions
  problems: Record<number, Record<string, string>>
  onChange: (blocks: Block[]) => void
  track?: (field: TagField) => TagFieldProps
  fieldsOnly?: boolean
}) {
  const { t } = useTranslation()
  const kind = (type: string) => (type in BLOCK_WORDS ? t(`loyalty.campaigns.block.${type}`, BLOCK_WORDS[type]) : type)
  const problem = (i: number, field: string): string | null => {
    const code = problems[i]?.[field]
    return code ? t(`loyalty.campaigns.draft.problem.${code}`, DRAFT_PROBLEM_WORDS[code] ?? DRAFT_PROBLEM_WORDS.look) : null
  }

  return (
    <div className="space-y-3">
      {blocks.length === 0 && (
        <p className="rounded-xl border border-dashed border-a-border px-4 py-6 text-center text-sm text-a-text-2">{t('loyalty.campaigns.blocks.none', 'No blocks yet. Add a heading and some text below.')}</p>
      )}
      <ol className="space-y-3">
        {blocks.map((b, i) => {
          const n = i + 1
          const what = kind(b.type)
          return (
            <li key={b.id} data-block={b.type} className="space-y-3 rounded-xl border border-a-border bg-a-surface p-3">
              {!fieldsOnly && <div className="flex items-center gap-1">
                <span className="min-w-0 flex-1 text-xs font-medium uppercase tracking-[0.08em] text-a-text-2">{what}</span>
                <button type="button" className={ICON} disabled={i === 0} onClick={() => onChange(moveBlock(blocks, i, -1))}
                  aria-label={t('loyalty.campaigns.blocks.up', 'Move {{what}} {{n}} up', { what, n })}><ChevronUp size={16} aria-hidden /></button>
                <button type="button" className={ICON} disabled={i === blocks.length - 1} onClick={() => onChange(moveBlock(blocks, i, 1))}
                  aria-label={t('loyalty.campaigns.blocks.down', 'Move {{what}} {{n}} down', { what, n })}><ChevronDown size={16} aria-hidden /></button>
                <button type="button" className={ICON} onClick={() => onChange(removeBlock(blocks, i))}
                  aria-label={t('loyalty.campaigns.blocks.remove', 'Remove {{what}} {{n}}', { what, n })}><Trash2 size={16} aria-hidden /></button>
              </div>}

              {b.type === 'heading' && (
                <>
                  <FormField label={t('loyalty.campaigns.blocks.heading_text', 'Heading')} problem={problem(i, 'text')}>
                    <input type="text" value={b.text} maxLength={options.max_text.heading} onChange={(e) => onChange(patchBlock(blocks, i, { text: e.target.value }))} className={INPUT}
                      {...track?.({ kind: 'block', id: b.id })} />
                  </FormField>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label={t('loyalty.campaigns.blocks.size', 'Size')}>
                      <select value={b.level} onChange={(e) => onChange(patchBlock(blocks, i, { level: Number(e.target.value) as 1 | 2 | 3 }))} className={INPUT}>
                        {options.levels.map(level => <option key={level} value={level}>{String(level) in LEVEL_WORDS ? t(`loyalty.campaigns.level.${level}`, LEVEL_WORDS[String(level)]) : level}</option>)}
                      </select>
                    </FormField>
                    <AlignField value={b.align} options={options} onChange={(align) => onChange(patchBlock(blocks, i, { align }))} />
                  </div>
                </>
              )}
              {b.type === 'text' && (
                <>
                  <FormField label={t('loyalty.campaigns.blocks.text', 'Text')} problem={problem(i, 'text')}
                    hint={t('loyalty.campaigns.blocks.text_hint', 'A new line in the box is a new line in the email.')}>
                    <textarea value={b.text} rows={fieldsOnly ? 3 : 4} maxLength={options.max_text.text} onChange={(e) => onChange(patchBlock(blocks, i, { text: e.target.value }))} className={INPUT}
                      {...track?.({ kind: 'block', id: b.id })} />
                  </FormField>
                  <div className="grid grid-cols-2 gap-2">
                    <AlignField value={b.align} options={options} onChange={(align) => onChange(patchBlock(blocks, i, { align }))} />
                  </div>
                </>
              )}
              {b.type === 'button' && (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <FormField label={t('loyalty.campaigns.blocks.label', 'Label')} problem={problem(i, 'text')}>
                      <input type="text" value={b.text} maxLength={options.max_text.button} onChange={(e) => onChange(patchBlock(blocks, i, { text: e.target.value }))} className={INPUT}
                        placeholder={t('loyalty.campaigns.blocks.label_example', 'e.g. Book your stay')} {...track?.({ kind: 'block', id: b.id })} />
                    </FormField>
                    <FormField label={t('loyalty.campaigns.blocks.link', 'Link')} problem={problem(i, 'url')}>
                      <input type="url" inputMode="url" value={b.url} maxLength={options.max_url} onChange={(e) => onChange(patchBlock(blocks, i, { url: e.target.value }))} className={INPUT}
                        placeholder="https://" />
                    </FormField>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AlignField value={b.align} options={options} onChange={(align) => onChange(patchBlock(blocks, i, { align }))} />
                  </div>
                </>
              )}
              {b.type === 'divider' && <p className="text-sm text-a-text-2">{t('loyalty.campaigns.blocks.divider_hint', 'A thin line across the email.')}</p>}
              {b.type === 'spacer' && <p className="text-sm text-a-text-2">{t('loyalty.campaigns.blocks.spacer_hint', 'Some empty space between blocks.')}</p>}
            </li>
          )
        })}
      </ol>

      {!fieldsOnly && blocks.length < options.max_blocks && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-a-text-2">{t('loyalty.campaigns.blocks.add', 'Add a block')}</p>
          <div className="flex flex-wrap gap-2">
            {options.block_types.map(type => (
              <Button key={type} type="button" size="sm" variant="secondary" onClick={() => onChange([...blocks, newBlock(type, options, blockId())])}>
                {kind(type)}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AlignField({ value, options, onChange }: { value: Align; options: CampaignOptions; onChange: (align: Align) => void }) {
  const { t } = useTranslation()
  return (
    <FormField label={t('loyalty.campaigns.blocks.align', 'Alignment')}>
      <select value={value} onChange={(e) => onChange(e.target.value as Align)} className={INPUT}>
        {options.aligns.map(align => <option key={align} value={align}>{align in ALIGN_WORDS ? t(`loyalty.campaigns.align.${align}`, ALIGN_WORDS[align]) : align}</option>)}
      </select>
    </FormField>
  )
}
