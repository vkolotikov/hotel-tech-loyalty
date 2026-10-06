import { describe, expect, it } from 'vitest'
import { initialStop, nextStop, orderStops, type Stop } from './gridFocus'

const stops = orderStops([
  { key: 'slot:0:660', col: 0, start: 660, end: 690 },
  { key: 'slot:0:540', col: 0, start: 540, end: 570 },
  { key: 'appt:7', col: 0, start: 600, end: 645 },
  { key: 'slot:1:600', col: 1, start: 600, end: 630 },
  { key: 'appt:9', col: 3, start: 615, end: 660 },
])
const at = (key: string): Stop => stops.find(s => s.key === key)!

describe('arrow keys in the grid', () => {
  it('goes up and down a column, and to its first and last stop', () => {
    expect(nextStop(stops, at('slot:0:540'), 'ArrowDown')?.key).toBe('appt:7')
    expect(nextStop(stops, at('appt:7'), 'ArrowUp')?.key).toBe('slot:0:540')
    expect(nextStop(stops, at('slot:0:540'), 'ArrowUp')).toBeNull()
    expect(nextStop(stops, at('slot:0:660'), 'Home')?.key).toBe('slot:0:540')
    expect(nextStop(stops, at('slot:0:540'), 'End')?.key).toBe('slot:0:660')
  })

  it('goes across to the same time, the nearest stop, skipping an empty column', () => {
    expect(nextStop(stops, at('appt:7'), 'ArrowRight')?.key).toBe('slot:1:600')
    expect(nextStop(stops, at('slot:1:600'), 'ArrowRight')?.key).toBe('appt:9') // column 2 has no stop
    expect(nextStop(stops, at('slot:1:600'), 'ArrowLeft')?.key).toBe('appt:7') // the appointment covering 10:00
    expect(nextStop(stops, at('slot:0:540'), 'ArrowLeft')).toBeNull()
    expect(nextStop(stops, at('slot:0:540'), 'a')).toBeNull()
  })

  it('enters on the stop last used, else the open appointment, else the first', () => {
    expect(initialStop(stops, 'slot:1:600', null)?.key).toBe('slot:1:600')
    expect(initialStop(stops, null, 9)?.key).toBe('appt:9')
    expect(initialStop(stops, null, null)?.key).toBe('slot:0:540')
    expect(initialStop([], null, null)).toBeNull()
  })
})
