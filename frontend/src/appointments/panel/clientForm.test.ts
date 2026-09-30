import { describe, expect, it } from 'vitest'
import { clientFormKey, duplicatesFor } from './clientForm'
import type { ClientSummary } from '../lib/types'

const sophie: ClientSummary = { id: 5, name: 'Sophie Williams', phone: '+44 7700 900123', email: null, member: null }
const form = { name: 'Sophie Williams', phone: '+44 7700 900123', email: '' }

describe('clientFormKey', () => {
  it('is the same for the same details, whatever the spacing or the case of the email', () => {
    expect(clientFormKey({ name: ' Sophie Williams ', phone: '+44 7700 900123 ', email: '' })).toBe(clientFormKey(form))
    expect(clientFormKey({ ...form, email: 'Sophie@Example.test' })).toBe(clientFormKey({ ...form, email: 'sophie@example.test ' }))
  })

  it('changes when the name, the phone or the email changes', () => {
    const key = clientFormKey(form)
    expect(clientFormKey({ ...form, name: 'Sophie Williamson' })).not.toBe(key)
    expect(clientFormKey({ ...form, phone: '+44 7700 900124' })).not.toBe(key)
    expect(clientFormKey({ ...form, email: 'sophie@example.test' })).not.toBe(key)
  })
})

describe('duplicatesFor', () => {
  const warned = { for: clientFormKey(form), list: [sophie] }

  it('shows the likely duplicates for the details they were found for', () => {
    expect(duplicatesFor(warned, form)).toEqual([sophie])
  })

  it('drops them once the details are edited: "add anyway" must never skip the check for details nobody checked', () => {
    expect(duplicatesFor(warned, { ...form, phone: '+44 7700 900999' })).toBeNull()
    expect(duplicatesFor(warned, { ...form, email: 'other@example.test' })).toBeNull()
  })

  it('is nothing when no duplicate was reported', () => {
    expect(duplicatesFor(null, form)).toBeNull()
  })
})
