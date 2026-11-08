import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PipelinePage } from './PipelinePage'
import { pipelineTarget } from './redirect'

function render(at: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/crm/pipeline" element={<PipelinePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('the old Pipeline address (round 2: the board is in Leads, the won deals are Deals)', () => {
  it('sends the board to Leads → Board, keeping the chosen pipeline', () => {
    expect(pipelineTarget('')).toBe('/crm/leads?view=board')
    expect(pipelineTarget('?p=3')).toBe('/crm/leads?view=board&p=3')
    expect(pipelineTarget('?p=nope')).toBe('/crm/leads?view=board')
  })

  it('sends the won deals to Deals, keeping their filter, sort and page', () => {
    expect(pipelineTarget('?tab=won')).toBe('/crm/deals')
    expect(pipelineTarget('?tab=won&deal=overdue&dsort=amount&dpage=2')).toBe('/crm/deals?filter=overdue&sort=amount&page=2')
  })

  it('renders no page of its own (it only hands on to the new address)', () => {
    // A string render runs no effects, so the hand-over itself is pipelineTarget's, tested above.
    expect(render('/crm/pipeline?p=2')).toBe('')
  })
})
