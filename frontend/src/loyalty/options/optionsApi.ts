import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type { OptionsAnswer, Options, SetupAnswer, SetupBody } from './types'

/** "Ways to earn"'s calls (release 7 §1): one read, a manager's change, and the wizard's apply and skip. */
export const optionsApi = {
  options: (): Promise<OptionsAnswer> => watched(api.get(loyaltyUrl('options'))),
  /** Only the options that changed; the answer is the whole page again. */
  save: (options: Options): Promise<OptionsAnswer> => watched(api.put(loyaltyUrl('options'), { options })),
  /** A retry with the same key answers the first apply and writes nothing. */
  setup: (body: SetupBody): Promise<SetupAnswer> => watched(api.post(loyaltyUrl('options/setup'), body)),
  skip: (): Promise<OptionsAnswer> => watched(api.post(loyaltyUrl('options/setup/skip'))),
}

export const OPTIONS_KEY = ['loyalty', 'options'] as const

/**
 * What a saved change makes stale: the page takes the answer as it is; the bootstrap's `programme.ways` (which Scan
 * and a member's page read to offer Check in and credit, and the banner reads for the wizard) is read again. A wizard
 * that applied a preset built tiers and rewards: Program, Rewards and the members' tiers are read again too.
 */
export function afterOptionsChange(client: QueryClient, answer: OptionsAnswer, built = false): void {
  client.setQueryData(OPTIONS_KEY, answer)
  void client.invalidateQueries({ queryKey: ['loyalty', 'bootstrap'] })
  void client.invalidateQueries({ queryKey: ['loyalty', 'overview'] })
  if (built) {
    void client.invalidateQueries({ queryKey: ['loyalty', 'program'] })
    void client.invalidateQueries({ queryKey: ['loyalty', 'rewards'] })
    void client.invalidateQueries({ queryKey: ['loyalty', 'members'] })
  }
}
