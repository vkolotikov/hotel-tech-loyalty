import { describe, expect, it } from 'vitest'
import { payOutcome } from './payOutcome'

describe('payOutcome', () => {
  it('is paid, with the intent id, for requires_capture', () => {
    expect(payOutcome({ paymentIntent: { id: 'pi_1', status: 'requires_capture' } })).toEqual({ kind: 'paid', id: 'pi_1' })
  })

  it('is paid, with the intent id, for succeeded', () => {
    expect(payOutcome({ paymentIntent: { id: 'pi_2', status: 'succeeded' } })).toEqual({ kind: 'paid', id: 'pi_2' })
  })

  it('is failed, carrying Stripe\'s own message, when Stripe returned an error', () => {
    expect(payOutcome({ error: { message: 'Your card was declined.' } })).toEqual({ kind: 'failed', message: 'Your card was declined.' })
  })

  it('is failed with a null message when Stripe gave no message of its own', () => {
    expect(payOutcome({ error: {} })).toEqual({ kind: 'failed', message: null })
    expect(payOutcome({ error: { message: null } })).toEqual({ kind: 'failed', message: null })
  })

  it('is incomplete for any other status, or no intent and no error at all', () => {
    expect(payOutcome({ paymentIntent: { id: 'pi_3', status: 'requires_action' } })).toEqual({ kind: 'incomplete' })
    expect(payOutcome({ paymentIntent: { id: 'pi_4', status: 'processing' } })).toEqual({ kind: 'incomplete' })
    expect(payOutcome({})).toEqual({ kind: 'incomplete' })
  })
})
