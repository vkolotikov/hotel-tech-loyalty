import { describe, expect, it } from 'vitest'
import {
  modelAllowed, modelCapabilities, modelForm, modelOptions, modelPayload, modelProblems, probeState, sameModel, savedModelBlocked, switchProvider,
} from './modelLogic'

describe('the assistant\'s AI model', () => {
  it('reads the saved settings, and the server\'s defaults when nothing was saved', () => {
    expect(modelForm({ provider: 'anthropic', model_name: 'claude-haiku-5-5', temperature: '0.40', max_tokens: '800', reasoning_effort: 'high', verbosity: 'low' }))
      .toEqual({ provider: 'anthropic', model_name: 'claude-haiku-5-5', temperature: 0.4, max_tokens: 800, reasoning_effort: 'high', verbosity: 'low' })
    expect(modelForm(undefined)).toMatchObject({ provider: 'openai', model_name: 'gpt-5.6-terra', temperature: 0.7, max_tokens: 1024, reasoning_effort: 'low', verbosity: 'medium' })
    expect(modelForm({ provider: 'nobody', model_name: '' }).provider).toBe('openai')
  })

  it('takes no list, or an empty one, as every model (AiUsageService::isModelAllowed)', () => {
    expect(modelAllowed(null, 'gpt-5.5')).toBe(true)
    expect(modelAllowed([], 'gpt-5.5')).toBe(true)
    expect(modelAllowed(['gpt-5.6-luna'], 'gpt-5.5')).toBe(false)
    expect(modelAllowed(['gpt-5.6-luna'], 'gpt-5.6-luna')).toBe(true)
  })

  it('offers the provider\'s models, an older saved one first, each marked when the plan lacks it', () => {
    const options = modelOptions('openai', 'gpt-4o', ['gpt-5.6-luna', 'gpt-4o'])
    expect(options[0]).toEqual({ id: 'gpt-4o', label: 'gpt-4o', recommended: false, older: true, allowed: true })
    expect(options.find(o => o.id === 'gpt-5.6-luna')?.allowed).toBe(true)
    expect(options.find(o => o.id === 'gpt-5.6-terra')).toMatchObject({ allowed: false, recommended: true })
    expect(modelOptions('openai', 'gpt-5.5', null).every(o => o.allowed && !o.older)).toBe(true)
  })

  it('switches provider to its recommended model, or the first the plan includes', () => {
    const form = modelForm({ provider: 'openai', model_name: 'gpt-5.5' })
    expect(switchProvider(form, 'anthropic', null).model_name).toBe('claude-haiku-5-5')
    expect(switchProvider(form, 'anthropic', ['claude-sonnet-5-5']).model_name).toBe('claude-sonnet-5-5')
    // None of its models in the plan: its default, which the page then marks and the save refuses.
    expect(switchProvider(form, 'google', ['gpt-5.5'])).toMatchObject({ provider: 'google', model_name: 'gemini-3.5-flash-lite' })
  })

  it('knows what the chosen model takes', () => {
    expect(modelCapabilities({ provider: 'openai', model_name: 'gpt-5.5' })).toEqual({ temperature: true, reasoning: true, verbosity: true })
    expect(modelCapabilities({ provider: 'anthropic', model_name: 'claude-haiku-5-5' })).toEqual({ temperature: false, reasoning: false, verbosity: false })
    // An older saved model follows its provider's rule.
    expect(modelCapabilities({ provider: 'openai', model_name: 'gpt-4o' }).temperature).toBe(true)
  })

  it('refuses a switch to a model the plan lacks, never the saved one, and numbers out of range', () => {
    const saved = modelForm({ provider: 'openai', model_name: 'gpt-5.5' })
    expect(modelProblems(saved, saved, ['gpt-5.6-luna'])).toEqual([])
    expect(modelProblems({ ...saved, model_name: 'gpt-5.6-terra' }, saved, ['gpt-5.6-luna'])).toEqual(['not_in_plan'])
    expect(modelProblems({ ...saved, temperature: 2.5, max_tokens: 20 }, saved, null)).toEqual(['temperature', 'max_tokens'])
    expect(savedModelBlocked(saved, ['gpt-5.6-luna'])).toBe(true)
    expect(savedModelBlocked(saved, null)).toBe(false)
  })

  it('sends only what the model takes, so a stored reasoning setting is kept for another model', () => {
    const openai = modelForm({ provider: 'openai', model_name: 'gpt-5.5', temperature: 0.333, reasoning_effort: 'medium', verbosity: 'low' })
    expect(modelPayload(openai)).toEqual({ provider: 'openai', model_name: 'gpt-5.5', temperature: 0.33, max_tokens: 1024, reasoning_effort: 'medium', verbosity: 'low' })
    expect(modelPayload({ ...openai, provider: 'anthropic', model_name: 'claude-haiku-5-5' })).toEqual({ provider: 'anthropic', model_name: 'claude-haiku-5-5', temperature: 0.33, max_tokens: 1024 })
    expect(sameModel(openai, { ...openai })).toBe(true)
    expect(sameModel(openai, { ...openai, max_tokens: 2048 })).toBe(false)
  })

  it('words a probe\'s answer as a state', () => {
    expect(probeState(null, false)).toBe('idle')
    expect(probeState({ available: true }, false)).toBe('ready')
    expect(probeState({ available: false }, false)).toBe('unavailable')
    expect(probeState(null, true)).toBe('failed')
  })
})
