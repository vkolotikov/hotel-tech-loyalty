import { describe, expect, it, vi } from 'vitest'
import { inDialog, isTyping, modalOpen, onShortcuts, shortcutFor, type KeyLike, type Shortcut } from './shortcuts'

const el = (tag: string, opts: { type?: string; editable?: boolean; role?: string; inDialog?: boolean; stop?: boolean } = {}) => ({
  tagName: tag.toUpperCase(), isContentEditable: !!opts.editable,
  getAttribute: (n: string) => (n === 'type' ? opts.type ?? null : n === 'role' ? opts.role ?? null : null),
  closest: (sel: string) => ((sel.includes('dialog') && opts.inDialog) || (sel.includes('data-stop') && opts.stop) ? {} : null),
}) as unknown as EventTarget
const key = (k: string, target = el('body'), mods: Partial<KeyLike> = {}): KeyLike => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, target, ...mods })
const free = { modal: false }

describe('shortcuts', () => {
  it('maps the keys on the page', () => {
    expect(shortcutFor(key('n'), free)).toBe('new')
    expect(shortcutFor(key('T'), free)).toBe('today')
    expect(shortcutFor(key('ArrowLeft'), free)).toBe('prev')
    expect(shortcutFor(key('ArrowRight'), free)).toBe('next')
    expect(shortcutFor(key('d'), free)).toBe('day')
    expect(shortcutFor(key('w'), free)).toBe('week')
    expect(shortcutFor(key('l'), free)).toBe('list')
    expect(shortcutFor(key('/'), free)).toBe('find')
    expect(shortcutFor(key('?'), free)).toBe('help')
    expect(shortcutFor(key('k', el('body'), { ctrlKey: true }), free)).toBe('find')
    expect(shortcutFor(key('k', el('body'), { metaKey: true }), free)).toBe('find')
  })

  it('lets people type: only Ctrl/⌘ K works in a field', () => {
    for (const target of [el('input', { type: 'text' }), el('textarea'), el('select'), el('div', { editable: true }), el('div', { role: 'combobox' })]) {
      for (const k of ['n', 't', 'd', 'w', 'l', '/', '?', 'ArrowLeft']) expect(shortcutFor(key(k, target), free)).toBeNull()
      expect(shortcutFor(key('k', target, { ctrlKey: true }), free)).toBe('find')
    }
    expect(shortcutFor(key('n', el('input', { type: 'checkbox' })), free)).toBe('new')
  })

  it('stays out of dialogs, modals, modified keys and the grid\'s own arrows', () => {
    expect(shortcutFor(key('n', el('button', { inDialog: true })), free)).toBeNull()
    expect(shortcutFor(key('n'), { modal: true })).toBeNull()
    expect(shortcutFor(key('k', el('body'), { ctrlKey: true }), { modal: true })).toBeNull()
    expect(shortcutFor(key('n', el('body'), { ctrlKey: true }), free)).toBeNull()
    expect(shortcutFor(key('n', el('body'), { altKey: true }), free)).toBeNull()
    expect(shortcutFor(key('ArrowLeft', el('button', { stop: true })), free)).toBeNull()
    expect(shortcutFor(key('t', el('button', { stop: true })), free)).toBe('today')
    expect(shortcutFor({ ...key('n'), defaultPrevented: true }, free)).toBeNull()
  })

  it('knows the other arrow the grid owns, and every other key it does not use', () => {
    expect(shortcutFor(key('ArrowRight', el('button', { stop: true })), free)).toBeNull()
    for (const k of ['a', 'Enter', ' ', 'Escape', 'ArrowUp', 'ArrowDown', 'Tab', 'F1', '1']) expect(shortcutFor(key(k), free), k).toBeNull()
  })

  it('works with the caps lock on or shift held', () => {
    expect(shortcutFor(key('N'), free)).toBe('new')
    expect(shortcutFor(key('K', el('body'), { ctrlKey: true }), free)).toBe('find')
  })

  // A Russian (ЙЦУКЕН) layout: the same physical keys type Cyrillic letters, "." and ",".
  it('works on a non-Latin layout by where the key sits', () => {
    expect(shortcutFor(key('л', el('body'), { code: 'KeyK', ctrlKey: true }), free)).toBe('find')
    expect(shortcutFor(key('л', el('body'), { code: 'KeyK', metaKey: true }), free)).toBe('find')
    expect(shortcutFor(key('т', el('body'), { code: 'KeyN' }), free)).toBe('new')
    expect(shortcutFor(key('е', el('body'), { code: 'KeyT' }), free)).toBe('today')
    expect(shortcutFor(key('в', el('body'), { code: 'KeyD' }), free)).toBe('day')
    expect(shortcutFor(key('ц', el('body'), { code: 'KeyW' }), free)).toBe('week')
    expect(shortcutFor(key('д', el('body'), { code: 'KeyL' }), free)).toBe('list')
    expect(shortcutFor(key('.', el('body'), { code: 'Slash' }), free)).toBe('find')
    expect(shortcutFor(key(',', el('body'), { code: 'Slash', shiftKey: true }), free)).toBe('help')
    expect(shortcutFor(key('Т', el('body'), { code: 'KeyN', shiftKey: true }), free)).toBe('new') // caps lock on
    expect(shortcutFor(key('ф', el('body'), { code: 'KeyA' }), free)).toBeNull()
  })

  it('reads the character first, so a Latin layout keeps its own letters', () => {
    expect(shortcutFor(key('?', el('body'), { code: 'Digit7', shiftKey: true }), free)).toBe('help') // "?" typed on a Russian layout
    expect(shortcutFor(key('n', el('body'), { code: 'KeyL' }), free)).toBe('new') // Dvorak's N sits on L
    expect(shortcutFor(key('b', el('body'), { code: 'KeyN' }), free)).toBeNull() // and its B on N
    expect(shortcutFor(key('t', el('body'), { code: 'KeyK', ctrlKey: true }), free)).toBeNull() // Dvorak Ctrl T is not Find
  })

  // The key at the US "/" place types other punctuation on Latin layouts: "-" (German, Spanish, Italian, Nordic),
  // "!" (French AZERTY), ";" (Brazilian ABNT2). Only the Cyrillic layouts' own "." and Shift "," are read by that place.
  it('reads the "/" place only for the Cyrillic layouts\' "." and Shift ","', () => {
    for (const k of ['-', '!', ';']) expect(shortcutFor(key(k, el('body'), { code: 'Slash' }), free), k).toBeNull()
    expect(shortcutFor(key('_', el('body'), { code: 'Slash', shiftKey: true }), free)).toBeNull()
    expect(shortcutFor(key('§', el('body'), { code: 'Slash', shiftKey: true }), free)).toBeNull()
    expect(shortcutFor(key('.', el('body'), { code: 'Slash' }), free)).toBe('find')
    expect(shortcutFor(key(',', el('body'), { code: 'Slash', shiftKey: true }), free)).toBe('help')
    expect(shortcutFor(key(',', el('body'), { code: 'Slash' }), free)).toBeNull() // not without Shift
    // "/" and "?" by the character work wherever a layout puts them.
    expect(shortcutFor(key('/', el('body'), { code: 'Digit7', shiftKey: true }), free)).toBe('find') // German
    expect(shortcutFor(key('/', el('body'), { code: 'Period', shiftKey: true }), free)).toBe('find') // French
    expect(shortcutFor(key('?', el('body'), { code: 'Minus', shiftKey: true }), free)).toBe('help') // German
  })

  it('counts accented Latin letters as Latin: they are never read by their place', () => {
    expect(shortcutFor(key('ñ', el('body'), { code: 'KeyN' }), free)).toBeNull()
    expect(shortcutFor(key('é', el('body'), { code: 'KeyD' }), free)).toBeNull()
    expect(shortcutFor(key('ł', el('body'), { code: 'KeyL' }), free)).toBeNull()
    expect(shortcutFor(key('ķ', el('body'), { code: 'KeyK', ctrlKey: true }), free)).toBeNull()
  })

  it('still lets people type on a non-Latin layout: only Ctrl/⌘ K works in a field', () => {
    for (const target of [el('input', { type: 'text' }), el('textarea'), el('div', { role: 'combobox' })]) {
      for (const [k, code] of [['т', 'KeyN'], ['е', 'KeyT'], ['в', 'KeyD'], ['ц', 'KeyW'], ['д', 'KeyL'], ['.', 'Slash']]) {
        expect(shortcutFor(key(k, target, { code }), free), `${k} ${code}`).toBeNull()
      }
      expect(shortcutFor(key(',', target, { code: 'Slash', shiftKey: true }), free)).toBeNull()
      expect(shortcutFor(key('л', target, { code: 'KeyK', ctrlKey: true }), free)).toBe('find')
    }
    expect(shortcutFor(key('т', el('button', { inDialog: true }), { code: 'KeyN' }), free)).toBeNull()
    expect(shortcutFor(key('т', el('body'), { code: 'KeyN' }), { modal: true })).toBeNull()
  })

  it('leaves Ctrl/⌘ Shift K to the browser (Firefox opens its console with it)', () => {
    expect(shortcutFor(key('K', el('body'), { ctrlKey: true, shiftKey: true }), free)).toBeNull()
    expect(shortcutFor(key('K', el('body'), { metaKey: true, shiftKey: true }), free)).toBeNull()
    expect(shortcutFor(key('Л', el('body'), { code: 'KeyK', ctrlKey: true, shiftKey: true }), free)).toBeNull()
  })

  it('reads the page the way the rules say', () => {
    expect(isTyping(null)).toBe(false)
    expect(isTyping({} as EventTarget)).toBe(false)
    expect(isTyping(el('input'))).toBe(true) // an input with no type is a text field
    expect(isTyping(el('input', { type: 'EMAIL' }))).toBe(true)
    for (const type of ['checkbox', 'radio', 'button', 'submit', 'range']) expect(isTyping(el('input', { type })), type).toBe(false)
    expect(isTyping(el('div', { role: 'textbox' }))).toBe(true)
    expect(isTyping(el('div', { role: 'searchbox' }))).toBe(true)
    expect(isTyping(el('button'))).toBe(false)

    expect(inDialog(null)).toBe(false)
    expect(inDialog(el('button'))).toBe(false)
    expect(inDialog(el('button', { inDialog: true }))).toBe(true)

    expect(modalOpen(undefined)).toBe(false)
    const asked: string[] = []
    expect(modalOpen({ querySelector: (s: string) => { asked.push(s); return null } })).toBe(false)
    expect(modalOpen({ querySelector: () => ({}) })).toBe(true)
    expect(asked).toEqual(['[aria-modal="true"]'])
  })
})

describe('listening for shortcuts', () => {
  const stubWindow = () => {
    const live = new Set<(e: KeyboardEvent) => void>()
    const win = {
      addEventListener: vi.fn((_type: string, fn: (e: KeyboardEvent) => void) => { live.add(fn) }),
      removeEventListener: vi.fn((_type: string, fn: (e: KeyboardEvent) => void) => { live.delete(fn) }),
    }
    const press = (k: string, mods: Partial<KeyLike> = {}) => {
      const e = { ...key(k, el('body'), mods), preventDefault: vi.fn() } as unknown as KeyboardEvent
      live.forEach(fn => fn(e))
      return e
    }
    return { win, live, press }
  }

  it('adds one keydown listener, and removes that very one when the page goes', () => {
    const { win, live } = stubWindow()
    const stop = onShortcuts(win, undefined, () => {})
    expect(win.addEventListener).toHaveBeenCalledTimes(1)
    expect(win.addEventListener.mock.calls[0][0]).toBe('keydown')
    expect(live.size).toBe(1)
    stop()
    expect(win.removeEventListener).toHaveBeenCalledTimes(1)
    expect(win.removeEventListener.mock.calls[0]).toEqual(win.addEventListener.mock.calls[0])
    expect(live.size).toBe(0)
  })

  it('tells the page which shortcut, and says nothing for a key that is not one', () => {
    const { win, press } = stubWindow()
    const heard: Shortcut[] = []
    const stop = onShortcuts(win, undefined, hit => { heard.push(hit) })
    press('n'); press('x'); press('ArrowLeft'); press('k', { ctrlKey: true }); press('n', { altKey: true })
    expect(heard).toEqual(['new', 'prev', 'find'])
    stop()
  })

  it('asks the page whether a modal is open at the moment of each key', () => {
    const { win, press } = stubWindow()
    let modal = false
    const doc = { querySelector: () => (modal ? {} : null) }
    const heard: Shortcut[] = []
    onShortcuts(win, doc, hit => { heard.push(hit) })
    press('n')
    modal = true
    press('n')
    modal = false
    press('t')
    expect(heard).toEqual(['new', 'today'])
  })
})
