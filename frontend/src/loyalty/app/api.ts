import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type { LookAnswer, LookBody, Look, Wallet, WalletBody, WalletFile } from './types'

/** Where each wallet file goes. */
const FILE_PATHS: Record<WalletFile, string> = {
  apple_cert: 'wallet/apple-cert',
  apple_wwdr: 'wallet/apple-wwdr',
  google_service_account: 'wallet/google-service-account',
}

/** Card & app's calls (release 2 §7): the wallet pass (a manager's, the plan's `wallet` feature) and the member app's look. */
export const appApi = {
  wallet: (): Promise<{ wallet: Wallet }> => watched(api.get(loyaltyUrl('wallet'))),
  saveWallet: (body: WalletBody): Promise<{ wallet: Wallet }> => watched(api.put(loyaltyUrl('wallet'), body)),
  /** A file as multipart `file`; the certificate takes its `password` beside it (none: the saved one must open it). */
  uploadWalletFile: (kind: WalletFile, file: File, password: string): Promise<{ wallet: Wallet }> => {
    const form = new FormData()
    form.append('file', file)
    if (kind === 'apple_cert' && password !== '') form.append('password', password)
    return watched(api.post(loyaltyUrl(FILE_PATHS[kind]), form))
  },

  look: (): Promise<LookAnswer> => watched(api.get(loyaltyUrl('app-look'))),
  saveLook: (body: LookBody): Promise<{ look: Look }> => watched(api.put(loyaltyUrl('app-look'), body)),
  uploadLogo: (file: File): Promise<{ logo_url: string }> => {
    const form = new FormData()
    form.append('logo', file)
    return watched(api.post(loyaltyUrl('app-look/logo'), form))
  },
}

export const WALLET_KEY = ['loyalty', 'app', 'wallet'] as const
export const LOOK_KEY = ['loyalty', 'app', 'look'] as const
