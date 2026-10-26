import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type { StartAnswer } from './startMath'

/** "Start here"'s one call: the setup steps and which are done (release 10). */
export const startApi = {
  progress: (): Promise<StartAnswer> => watched(api.get(loyaltyUrl('start'))),
}
