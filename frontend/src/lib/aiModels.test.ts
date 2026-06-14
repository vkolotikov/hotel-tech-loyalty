import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDERS,
  findModel,
  findProvider,
  formatModelLabel,
  type ModelEntry,
  type Provider,
} from './aiModels'

/**
 * Locks the AI model registry that powers Settings → AI Chat →
 * Chatbot Config. The single source of truth for:
 *
 *   - Provider list (openai / anthropic / google) + each
 *     provider's default model
 *   - Model entries per provider with capability flags
 *   - findModel / findProvider lookup helpers
 *   - formatModelLabel decorator (★ recommended marker +
 *     preview suffix + blurb)
 *
 * Why this matters: capability flags drive UI gates —
 * reasoning_effort visibility, vision warnings, responses-API
 * routing in DispatchesAiChat.php. A regression that drops a
 * capability flag silently disables the corresponding UI control.
 * A regression on the responsesApi flag specifically routes the
 * gpt-5.x family through the wrong endpoint (Chat Completions
 * instead of /v1/responses) — the docblock calls this out as the
 * known cause of "some models don't work correctly" reports.
 */
describe('AI_PROVIDERS — registry shape', () => {
  it('exposes the 3 supported providers (openai / anthropic / google)', () => {
    const ids = AI_PROVIDERS.map(p => p.id).sort()
    expect(ids).toEqual(['anthropic', 'google', 'openai'])
  })

  it('every provider has a label + defaultModel + non-empty models[]', () => {
    for (const p of AI_PROVIDERS) {
      expect(typeof p.label).toBe('string')
      expect(p.label.length).toBeGreaterThan(0)
      expect(typeof p.defaultModel).toBe('string')
      expect(p.defaultModel.length).toBeGreaterThan(0)
      expect(Array.isArray(p.models)).toBe(true)
      expect(p.models.length).toBeGreaterThan(0)
    }
  })

  it("every provider's defaultModel is a real id in that provider's models[]", () => {
    // Critical invariant: defaultModel is the fallback the dropdown
    // picks on first load. If it doesn't exist in models[], the
    // dropdown renders a blank selected value.
    for (const p of AI_PROVIDERS) {
      const ids = p.models.map(m => m.id)
      expect(ids).toContain(p.defaultModel)
    }
  })

  it('every model entry has a non-empty id + label + capabilities object', () => {
    for (const p of AI_PROVIDERS) {
      for (const m of p.models) {
        expect(typeof m.id).toBe('string')
        expect(m.id.length).toBeGreaterThan(0)
        expect(typeof m.label).toBe('string')
        expect(m.label.length).toBeGreaterThan(0)
        expect(m.capabilities).toBeTruthy()
        expect(typeof m.capabilities).toBe('object')
      }
    }
  })

  it('model ids are unique across ALL providers (registry-wide)', () => {
    const allIds = AI_PROVIDERS.flatMap(p => p.models.map(m => m.id))
    expect(new Set(allIds).size).toBe(allIds.length)
  })
})

describe('Capability flags — UI gate invariants', () => {
  it('every gpt-5.x family model is routed via the Responses API', () => {
    // The docblock + DispatchesAiChat.php documentation: gpt-5.x
    // models MUST route through /v1/responses, not /v1/chat/completions.
    // The latter is the wrong endpoint for these models and was
    // the cause of "some models don't work correctly" reports.
    const openai = AI_PROVIDERS.find(p => p.id === 'openai')!
    const gpt5Models = openai.models.filter(m => m.id.startsWith('gpt-5'))
    expect(gpt5Models.length).toBeGreaterThan(0)

    for (const m of gpt5Models) {
      expect(m.capabilities.responsesApi).toBe(true)
    }
  })

  it('every gpt-5.x model supports the reasoning + verbosity params', () => {
    // The two OpenAI-Responses-only params: reasoning_effort +
    // text.verbosity. The UI gates the inputs on these flags.
    const openai = AI_PROVIDERS.find(p => p.id === 'openai')!
    const gpt5Models = openai.models.filter(m => m.id.startsWith('gpt-5'))
    for (const m of gpt5Models) {
      expect(m.capabilities.reasoning).toBe(true)
      expect(m.capabilities.verbosity).toBe(true)
    }
  })

  it('gpt-4.1 family does NOT advertise responsesApi (Chat Completions only)', () => {
    // The complement: 4.1 family is dispatched via Chat Completions,
    // not Responses. responsesApi flag must be absent or false.
    const openai = AI_PROVIDERS.find(p => p.id === 'openai')!
    const gpt41Models = openai.models.filter(m => m.id.startsWith('gpt-4.1'))
    expect(gpt41Models.length).toBeGreaterThan(0)
    for (const m of gpt41Models) {
      expect(m.capabilities.responsesApi).toBeFalsy()
    }
  })

  it('defaultReasoningEffort uses one of the documented levels', () => {
    const validLevels = ['none', 'low', 'medium', 'high', 'xhigh']
    for (const p of AI_PROVIDERS) {
      for (const m of p.models) {
        if (m.capabilities.defaultReasoningEffort) {
          expect(validLevels).toContain(m.capabilities.defaultReasoningEffort)
        }
      }
    }
  })

  it('Anthropic models support vision + toolUse + streaming', () => {
    // Claude 4.x family canonical capabilities. CrmAiService relies
    // on toolUse for the 35+ admin AI tools.
    const anthropic = AI_PROVIDERS.find(p => p.id === 'anthropic')!
    for (const m of anthropic.models) {
      expect(m.capabilities.vision).toBe(true)
      expect(m.capabilities.toolUse).toBe(true)
      expect(m.capabilities.streaming).toBe(true)
    }
  })
})

describe('Recommended models — ★ marker invariants', () => {
  it('exactly one model per provider is marked recommended', () => {
    // The ★ shouldn't appear next to multiple options per provider
    // — that defeats the recommendation. CTR drops when "all
    // options are recommended" — pick one.
    for (const p of AI_PROVIDERS) {
      const recommended = p.models.filter(m => m.recommended === true)
      expect(recommended.length).toBe(1)
    }
  })

  it('preview models are NOT also marked recommended', () => {
    // Defensive: a preview model can't simultaneously be the
    // recommended GA pick. Either flag is fine alone.
    for (const p of AI_PROVIDERS) {
      for (const m of p.models) {
        if (m.preview) {
          expect(m.recommended).not.toBe(true)
        }
      }
    }
  })
})

describe('findModel — registry lookup', () => {
  it('finds an OpenAI model by id', () => {
    const m = findModel('gpt-4.1')
    expect(m).toBeTruthy()
    expect(m!.id).toBe('gpt-4.1')
  })

  it('finds an Anthropic model by id', () => {
    const m = findModel('claude-opus-4-6')
    expect(m).toBeTruthy()
    expect(m!.id).toBe('claude-opus-4-6')
  })

  it('finds a Google model by id', () => {
    const m = findModel('gemini-2.5-pro')
    expect(m).toBeTruthy()
    expect(m!.id).toBe('gemini-2.5-pro')
  })

  it('returns null for unknown model id', () => {
    expect(findModel('gpt-99-imaginary')).toBeNull()
  })

  it('returns null for null/undefined/empty input', () => {
    expect(findModel(null)).toBeNull()
    expect(findModel(undefined)).toBeNull()
    expect(findModel('')).toBeNull()
  })
})

describe('findProvider — provider lookup', () => {
  it('finds each of the 3 providers by id', () => {
    expect(findProvider('openai')?.id).toBe('openai')
    expect(findProvider('anthropic')?.id).toBe('anthropic')
    expect(findProvider('google')?.id).toBe('google')
  })

  it('returns null for unknown provider id', () => {
    expect(findProvider('aws-bedrock' as Provider)).toBeNull()
  })

  it('returns null for null/undefined/empty input', () => {
    expect(findProvider(null)).toBeNull()
    expect(findProvider(undefined)).toBeNull()
    expect(findProvider('')).toBeNull()
  })
})

describe('formatModelLabel — dropdown label decoration', () => {
  it('includes the ★ marker when recommended', () => {
    const m: ModelEntry = {
      id: 'gpt-test',
      label: 'GPT Test',
      blurb: 'A test model',
      recommended: true,
      capabilities: {},
    }
    const out = formatModelLabel(m)
    expect(out).toContain('★')
  })

  it('omits the ★ marker when not recommended', () => {
    const m: ModelEntry = {
      id: 'gpt-test',
      label: 'GPT Test',
      blurb: 'Test',
      capabilities: {},
    }
    const out = formatModelLabel(m)
    expect(out).not.toContain('★')
  })

  it('includes a (preview) suffix when preview=true', () => {
    const m: ModelEntry = {
      id: 'preview-model',
      label: 'Preview Model',
      preview: true,
      capabilities: {},
    }
    const out = formatModelLabel(m)
    expect(out).toContain('(preview)')
  })

  it('includes the blurb separated by an em-dash', () => {
    const m: ModelEntry = {
      id: 'gpt-test',
      label: 'GPT Test',
      blurb: 'Newest workhorse',
      capabilities: {},
    }
    const out = formatModelLabel(m)
    expect(out).toContain('— Newest workhorse')
  })

  it('handles a model with no blurb', () => {
    const m: ModelEntry = {
      id: 'gpt-test',
      label: 'GPT Test',
      capabilities: {},
    }
    const out = formatModelLabel(m)
    expect(out).toBe('GPT Test')
  })

  it('renders all decorations together in a stable order: label ★ (preview) — blurb', () => {
    const m: ModelEntry = {
      id: 'mega-model',
      label: 'Mega Model',
      blurb: 'Does everything',
      recommended: true,
      preview: true,
      capabilities: {},
    }
    const out = formatModelLabel(m)
    // Stars come before (preview), blurb last.
    expect(out.indexOf('★')).toBeLessThan(out.indexOf('(preview)'))
    expect(out.indexOf('(preview)')).toBeLessThan(out.indexOf('Does everything'))
  })

  it('integration: every real registry entry produces a non-empty formatted label', () => {
    for (const p of AI_PROVIDERS) {
      for (const m of p.models) {
        const out = formatModelLabel(m)
        expect(typeof out).toBe('string')
        expect(out.length).toBeGreaterThan(0)
      }
    }
  })
})
