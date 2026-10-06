import { describe, expect, it } from 'vitest'
import { saveDrop } from './saveDrop'

/** Polish F6: the dialog closed before the calendar was fetched again, so the card flashed back to its old place. */
describe('saving a drop', () => {
  it('resolves only once the calendar has been fetched again, so the dialog closes on the card at its new place', async () => {
    const order: string[] = []
    let landed = () => {}
    const refetched = new Promise<void>(resolve => { landed = resolve })
    const done = saveDrop({
      move: async () => { order.push('moved') },
      refetch: () => refetched.then(() => { order.push('refetched') }),
    }).then(() => { order.push('done') })

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(order).toEqual(['moved'])
    landed()
    await done
    expect(order).toEqual(['moved', 'refetched', 'done'])
  })

  it('does not keep the dialog waiting on a calendar fetch that never answers (polish review)', async () => {
    // The move is saved; a stalled refetch must not hold "Saving…" (Cancel disabled) for ever.
    const order: string[] = []
    await saveDrop({ move: async () => { order.push('moved') }, refetch: () => new Promise(() => {}), waitMs: 20 })
    expect(order).toEqual(['moved'])
  }, 1000)

  it('fetches the calendar again and still reports a refused move', async () => {
    const order: string[] = []
    await expect(saveDrop({
      move: async () => { throw new Error('slot_taken') },
      refetch: async () => { order.push('refetched') },
    })).rejects.toThrow('slot_taken')
    expect(order).toEqual(['refetched'])
  })
})
