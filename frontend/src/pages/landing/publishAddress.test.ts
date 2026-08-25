import { describe, expect, it } from 'vitest'
import { addressHost, buildAddressUrl, pageVisibilityState, previewSlug } from './publishAddress'

describe('previewSlug', () => {
  it('lowercases and hyphenates plain text', () => {
    expect(previewSlug('Glamour Salon')).toBe('glamour-salon')
  })

  it('trims leading and trailing whitespace', () => {
    expect(previewSlug('  glamour salon  ')).toBe('glamour-salon')
  })

  it('collapses runs of non-alphanumeric characters into one hyphen', () => {
    expect(previewSlug('Glamour!!!  --  Salon')).toBe('glamour-salon')
  })

  it('strips leading and trailing hyphens produced by punctuation at the edges', () => {
    expect(previewSlug('-Glamour Salon-')).toBe('glamour-salon')
    expect(previewSlug('!Glamour Salon!')).toBe('glamour-salon')
  })

  it('returns an empty string for input with nothing alphanumeric in it', () => {
    expect(previewSlug('   ---   ')).toBe('')
  })

  it('is cosmetic only and does not attempt real transliteration', () => {
    // Unlike the server's LandingSlug::normalise() (Str::slug), accented
    // characters are simply dropped rather than folded to ASCII — this
    // function is documented as never being what is actually submitted.
    expect(previewSlug('Café Mimi')).toBe('caf-mimi')
  })
})

describe('addressHost', () => {
  it('reads the host (and port) off a real absolute URL', () => {
    expect(addressHost('https://sites.hexa-tech.uk/glamour-salon')).toBe('sites.hexa-tech.uk')
  })

  it('keeps a non-default port, matching local dev (LANDING_HOST=sites.localhost)', () => {
    expect(addressHost('http://sites.localhost:8000/glamour-salon')).toBe('sites.localhost:8000')
  })

  it('falls back to the input unchanged rather than throwing on a malformed URL', () => {
    expect(addressHost('not-a-url')).toBe('not-a-url')
  })
})

describe('buildAddressUrl', () => {
  it('replaces the path with a normalised slug, keeping the real scheme and host', () => {
    expect(buildAddressUrl('https://sites.hexa-tech.uk/old-slug', 'New Address')).toBe(
      'https://sites.hexa-tech.uk/new-address',
    )
  })

  it('never lets raw, un-normalised text (spaces, capitals) leak into the returned URL', () => {
    const url = buildAddressUrl('https://sites.hexa-tech.uk/old-slug', 'My Salon Name')
    expect(url).not.toMatch(/[ A-Z]/)
  })

  it('preserves a non-default port from the source URL (local dev)', () => {
    expect(buildAddressUrl('http://sites.localhost:8000/old-slug', 'new-slug')).toBe(
      'http://sites.localhost:8000/new-slug',
    )
  })

  it('falls back to the input URL unchanged rather than throwing on a malformed URL', () => {
    expect(buildAddressUrl('not-a-url', 'new-slug')).toBe('not-a-url')
  })
})

describe('pageVisibilityState', () => {
  it('is tone "live" with no note when published and saved', () => {
    const state = pageVisibilityState('published', false)
    expect(state.tone).toBe('live')
    expect(state.noteKey).toBeNull()
  })

  it('is tone "live" WITH a note when published but the form has unsaved changes', () => {
    const state = pageVisibilityState('published', true)
    expect(state.tone).toBe('live')
    expect(state.noteKey).not.toBeNull()
    expect(state.noteFallback).not.toBeNull()
  })

  it('is tone "draft" with no note when unpublished, regardless of dirty state', () => {
    expect(pageVisibilityState('draft', false).tone).toBe('draft')
    expect(pageVisibilityState('draft', false).noteKey).toBeNull()

    // A draft is invisible to the public either way — there is nothing an
    // "unsaved changes" note could be warning about, unlike a published page.
    const dirtyDraft = pageVisibilityState('draft', true)
    expect(dirtyDraft.tone).toBe('draft')
    expect(dirtyDraft.noteKey).toBeNull()
  })

  it('draft and live headline keys are distinct', () => {
    expect(pageVisibilityState('draft', false).headlineKey).not.toBe(
      pageVisibilityState('published', false).headlineKey,
    )
  })
})
