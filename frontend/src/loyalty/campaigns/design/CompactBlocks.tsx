import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { OverviewButton } from '../../overview/OverviewUI'
import { BlockList } from '../BlockList'
import { blockId, moveBlock, newBlock, removeBlock, type TagField } from '../campaignsMath'
import type { Block, CampaignOptions } from '../types'
import type { TagFieldProps } from '../TagBar'
import { BLOCK_WORDS, DRAFT_PROBLEM_WORDS } from '../words'
import { useCampaignWords } from './words'

export function CompactBlocks({ blocks, options, problems, onChange, track }: { blocks: Block[]; options: CampaignOptions; problems: Record<number, Record<string, string>>; onChange: (blocks: Block[]) => void; track: (field: TagField) => TagFieldProps }) {
  const { t } = useTranslation(), w = useCampaignWords()
  const [selected, setSelected] = useState<string | null>(blocks[0]?.id ?? null)
  const current = blocks.find(b => b.id === selected) ?? blocks[0]
  const index = current ? blocks.indexOf(current) : -1
  const kind = (type: string) => t(`loyalty.campaigns.block.${type}`, BLOCK_WORDS[type] ?? type)
  return <div className="l-cm-blocks"><header className="l-cm-panel-head"><h2>{w('content')}</h2>{blocks.length < options.max_blocks && <details className="l-cm-menu"><summary className="l-ov-button">+ {t('loyalty.campaigns.blocks.add', 'Add a block')}</summary><div>{options.block_types.map(type => <OverviewButton key={type} type="button" onClick={e => { const block = newBlock(type, options, blockId()); onChange([...blocks, block]); setSelected(block.id); e.currentTarget.closest('details')?.removeAttribute('open') }}>{kind(type)}</OverviewButton>)}</div></details>}</header>
    <ol>{blocks.map((block, i) => <li key={block.id} className="l-cm-block-row" data-selected={current?.id === block.id || undefined}><button className="l-cm-block-select" aria-pressed={current?.id === block.id} onClick={() => setSelected(block.id)}><span>{i + 1} {kind(block.type)}</span><small>{'text' in block ? block.text.slice(0,70) : kind(block.type)}</small>{Object.values(problems[i] ?? {}).map((code, n) => <small className="text-a-danger" key={n}>{t(`loyalty.campaigns.draft.problem.${code}`, DRAFT_PROBLEM_WORDS[code] ?? DRAFT_PROBLEM_WORDS.look)}</small>)}</button><OverviewButton disabled={i === 0} aria-label={t('loyalty.campaigns.blocks.up', 'Move {{what}} {{n}} up', { what: kind(block.type), n: i + 1 })} onClick={() => onChange(moveBlock(blocks, i, -1))}>↑</OverviewButton><OverviewButton disabled={i === blocks.length - 1} aria-label={t('loyalty.campaigns.blocks.down', 'Move {{what}} {{n}} down', { what: kind(block.type), n: i + 1 })} onClick={() => onChange(moveBlock(blocks, i, 1))}>↓</OverviewButton><OverviewButton aria-label={t('loyalty.campaigns.blocks.remove', 'Remove {{what}} {{n}}', { what: kind(block.type), n: i + 1 })} onClick={() => onChange(removeBlock(blocks, i))}>−</OverviewButton></li>)}</ol>
    {current ? <div className="l-cm-block-editor"><BlockList fieldsOnly blocks={[current]} options={options} problems={{ 0: problems[index] ?? {} }} track={track} onChange={next => onChange(blocks.map(b => b.id === current.id ? next[0] : b))} /></div> : <p>{t('loyalty.campaigns.blocks.none', 'No blocks yet. Add a heading and some text below.')}</p>}
  </div>
}
