import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider, type MutationObserver } from '@tanstack/react-query'
import { CustomerDrawer } from './CustomerDrawer'
import { InquiryDrawer } from './InquiryDrawer'
import { api } from '../lib/api'

const harness = vi.hoisted(() => ({
  client: null as QueryClient | null,
  observers: [] as MutationObserver<any, any, any, any>[],
  mutationIndex: 0,
  fields: new Map<string, (value: string | null) => Promise<void>>(),
  bodyKey: undefined as unknown,
  inquiryTab: 'lead',
}))

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback: any) => typeof fallback === 'string' ? fallback : fallback?.defaultValue ?? key }),
}))
vi.mock('./ChatHistoryPanel', () => ({ ChatHistoryPanel: () => null }))
vi.mock('./InquiryActivityTimeline', () => ({ InquiryActivityTimeline: () => null }))
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useState: (initial: any) => actual.useState(initial === 'lead' ? harness.inquiryTab : initial) }
})

// The project uses Node-only Vitest. Capture the actual field save callbacks
// from server-rendered elements, and retain real TanStack MutationObservers
// across renders. This drives pending mutations/option replacement without
// mocking API call routing or requiring a browser/DOM dependency.
vi.mock('react/jsx-runtime', async importOriginal => {
  const actual = await importOriginal<typeof import('react/jsx-runtime')>()
  const capture = (props: any, key: unknown) => {
    if (typeof props?.onSave === 'function') harness.fields.set(props.label, props.onSave)
    if (props?.className?.startsWith('flex-1 overflow-y-auto')) harness.bodyKey = key
  }
  return {
    ...actual,
    jsx: (type: any, props: any, key: any) => { capture(props, key); return actual.jsx(type, props, key) },
    jsxs: (type: any, props: any, key: any) => { capture(props, key); return actual.jsxs(type, props, key) },
  }
})
vi.mock('react/jsx-dev-runtime', async importOriginal => {
  const actual = await importOriginal<typeof import('react/jsx-dev-runtime')>()
  return {
    ...actual,
    jsxDEV: (type: any, props: any, key: any, staticChildren: boolean, source: any, self: any) => {
      if (typeof props?.onSave === 'function') harness.fields.set(props.label, props.onSave)
      if (props?.className?.startsWith('flex-1 overflow-y-auto')) harness.bodyKey = key
      return actual.jsxDEV(type, props, key, staticChildren, source, self)
    },
  }
})
vi.mock('@tanstack/react-query', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useMutation: (options: any) => {
      const index = harness.mutationIndex++
      const observer = harness.observers[index] ??= new actual.MutationObserver(harness.client!, options)
      observer.setOptions(options)
      return { ...observer.getCurrentResult(), mutateAsync: (variables: any) => observer.mutate(variables) }
    },
  }
})

const close = vi.fn()
const inquiry = { id: 267, status: 'New', guest: { id: 379, full_name: 'Original customer', email: 'old@example.test' } }

function render(element: ReactElement) {
  harness.fields.clear()
  harness.bodyKey = undefined
  harness.mutationIndex = 0
  return renderToStaticMarkup(<QueryClientProvider client={harness.client!}>{element}</QueryClientProvider>)
}

function field(label: string) {
  const save = harness.fields.get(label)
  expect(save, `Expected editable field ${label}`).toBeTypeOf('function')
  return save!
}

function deferredResponse() {
  let resolve!: (value: any) => void
  const promise = new Promise<any>(done => { resolve = done })
  vi.mocked(api.put).mockReturnValueOnce(promise)
  return resolve
}

beforeEach(() => {
  vi.clearAllMocks()
  harness.client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } })
  harness.observers = []
  harness.inquiryTab = 'lead'
  harness.client.setQueryData(['guest', 379], inquiry.guest)
  harness.client.setQueryData(['guest', 380], { id: 380, full_name: 'Next customer' })
  vi.mocked(api.put).mockResolvedValue({ data: { id: 267 } })
})

afterEach(() => {
  harness.client?.clear()
})

describe('inquiry drawer save identity', () => {
  it('saves a partial edit to its original inquiry and reports that ID after selection changes', async () => {
    const resolve = deferredResponse()
    const updated = vi.fn()
    render(<InquiryDrawer open inquiry={inquiry} onClose={close} onInquiryUpdated={updated} />)
    const saving = field('Priority')('High')
    await vi.waitFor(() => expect(api.put).toHaveBeenCalledWith('/v1/admin/inquiries/267', { priority: 'High' }))
    render(<InquiryDrawer open inquiry={{ ...inquiry, id: 268 }} onClose={close} onInquiryUpdated={updated} />)
    resolve({ data: { id: 267 } })
    await saving
    expect(updated).toHaveBeenCalledTimes(1)
    expect(updated).toHaveBeenCalledWith(267)
  })

  it.each(['missing', 'changed', 'closed'] as const)('cancels an old field callback when the selected inquiry is %s', async transition => {
    render(<InquiryDrawer open inquiry={inquiry} onClose={close} />)
    const save = field('Priority')
    render(<InquiryDrawer open={transition !== 'closed'} inquiry={transition === 'missing' ? undefined : { ...inquiry, id: 268 }} onClose={close} />)
    await save('High')
    expect(api.put).not.toHaveBeenCalled()
  })

  it('cancels a queued mutation if a refetch removes the row before the request starts', async () => {
    render(<InquiryDrawer open inquiry={inquiry} onClose={close} />)
    const saving = field('Priority')('High')
    render(<InquiryDrawer open inquiry={undefined} onClose={close} />)
    await saving
    expect(api.put).not.toHaveBeenCalled()
  })

  it.each(['missing', 'relinked', 'other-inquiry'] as const)('cancels a linked customer edit when its selection becomes %s', async transition => {
    harness.inquiryTab = 'customer'
    render(<InquiryDrawer open inquiry={inquiry} onClose={close} />)
    const save = field('Email')
    const next = transition === 'missing' ? { ...inquiry, guest: null }
      : transition === 'relinked' ? { ...inquiry, guest: { ...inquiry.guest, id: 380 } }
        : { ...inquiry, id: 268 }
    render(<InquiryDrawer open inquiry={next} onClose={close} />)
    await save('changed@example.test')
    expect(api.put).not.toHaveBeenCalled()
  })

  it('invalidates the original linked customer after an in-flight save completes on another row', async () => {
    harness.inquiryTab = 'customer'
    const resolve = deferredResponse()
    const invalidate = vi.spyOn(harness.client!, 'invalidateQueries')
    render(<InquiryDrawer open inquiry={inquiry} onClose={close} />)
    const saving = field('Email')('changed@example.test')
    await vi.waitFor(() => expect(api.put).toHaveBeenCalledWith('/v1/admin/guests/379', { email: 'changed@example.test' }))
    render(<InquiryDrawer open inquiry={{ ...inquiry, id: 268, guest: { ...inquiry.guest, id: 380 } }} onClose={close} />)
    resolve({ data: { id: 379 } })
    await saving
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['guest', 379] })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['guest', 380] })
  })

  it('remounts the editor for another inquiry or linked customer even when field values match', () => {
    render(<InquiryDrawer open inquiry={inquiry} onClose={close} />)
    const firstKey = harness.bodyKey
    render(<InquiryDrawer open inquiry={{ ...inquiry, id: 268 }} onClose={close} />)
    expect(harness.bodyKey).not.toEqual(firstKey)
    render(<InquiryDrawer open inquiry={{ ...inquiry, guest: { ...inquiry.guest, id: 380 } }} onClose={close} />)
    expect(harness.bodyKey).not.toEqual(firstKey)
  })
})

describe('customer drawer save identity', () => {
  it.each(['missing', 'changed', 'closed', 'unavailable'] as const)('cancels the original customer field when selection is %s', async transition => {
    render(<CustomerDrawer open guestId={379} onClose={close} />)
    const save = field('Email')
    if (transition === 'unavailable') harness.client!.removeQueries({ queryKey: ['guest', 379] })
    render(<CustomerDrawer open={transition !== 'closed'} guestId={transition === 'missing' ? null : transition === 'changed' ? 380 : 379} onClose={close} />)
    await save('changed@example.test')
    expect(api.put).not.toHaveBeenCalled()
  })

  it('cancels a queued save if selection changes before the request starts', async () => {
    render(<CustomerDrawer open guestId={379} onClose={close} />)
    const saving = field('Email')('changed@example.test')
    render(<CustomerDrawer open guestId={380} onClose={close} />)
    await saving
    expect(api.put).not.toHaveBeenCalled()
  })

  it('writes a late response only to the original customer cache', async () => {
    const resolve = deferredResponse()
    const updated = vi.fn()
    render(<CustomerDrawer open guestId={379} onClose={close} onGuestUpdated={updated} />)
    const saving = field('Email')('changed@example.test')
    await vi.waitFor(() => expect(api.put).toHaveBeenCalledWith('/v1/admin/guests/379', { email: 'changed@example.test' }))
    render(<CustomerDrawer open guestId={380} onClose={close} onGuestUpdated={updated} />)
    resolve({ data: { id: 379, full_name: 'Saved original', email: 'changed@example.test' } })
    await saving
    expect(harness.client!.getQueryData(['guest', 379])).toMatchObject({ id: 379, email: 'changed@example.test' })
    expect(harness.client!.getQueryData(['guest', 380])).toEqual({ id: 380, full_name: 'Next customer' })
    expect(updated).toHaveBeenCalledTimes(1)
    expect(updated).toHaveBeenCalledWith({ id: 379, full_name: 'Saved original', email: 'changed@example.test' })
  })

  it('remounts the fields for another selected customer and rejects mismatched query data', () => {
    render(<CustomerDrawer open guestId={379} onClose={close} />)
    const firstKey = harness.bodyKey
    render(<CustomerDrawer open guestId={380} onClose={close} />)
    expect(harness.bodyKey).not.toEqual(firstKey)
    harness.client!.setQueryData(['guest', 380], { id: 379, full_name: 'Wrong cached record' })
    render(<CustomerDrawer open guestId={380} onClose={close} />)
    expect(harness.fields.size).toBe(0)
  })
})

describe('malformed runtime IDs', () => {
  it.each([null, undefined, 'undefined', 'null', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('does not expose editable fields for %s', id => {
    render(<InquiryDrawer open inquiry={{ ...inquiry, id: id as number }} onClose={close} />)
    expect(harness.fields.size).toBe(0)
    harness.observers = []
    render(<CustomerDrawer open guestId={id as number} onClose={close} />)
    expect(harness.fields.size).toBe(0)
    expect(api.get).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
  })
})
