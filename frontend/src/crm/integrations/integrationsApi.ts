import type { TFunction } from 'i18next'
import { failureOf, get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import type { AiUsage, CreatedToken, Diagnostic, IntakeToken, MailSettings, MessengerAccount, MessengerConfig, PageOption } from './integrationsLogic'

/**
 * Integrations' calls (round 5, 2026-11-12). The workspace's own `crm/intake-tokens`, `crm/mail-settings` and
 * `crm/ai-usage` (IntegrationsController, behind `workspace:crm`), and the full admin's own Messenger endpoints
 * (`integrations/messenger*`, MessengerIntegrationController), which AccessMap gives a CRM organisation's managers.
 */
export const INTEGRATION_KEYS = {
  tokens: ['crm', 'integrations', 'tokens'],
  mail: ['crm', 'integrations', 'mail'],
  ai: ['crm', 'integrations', 'ai-usage'],
  messengerConfig: ['crm', 'integrations', 'messenger', 'config'],
  messenger: ['crm', 'integrations', 'messenger', 'accounts'],
} as const

export const integrationsApi = {
  tokens: () => get<{ data: IntakeToken[]; limit: number }>('crm/intake-tokens'),
  createToken: (label: string) => send<CreatedToken>('post', 'crm/intake-tokens', { label }),
  revokeToken: (id: number) => send<{ revoked: boolean }>('delete', `crm/intake-tokens/${id}`),
  mail: () => get<MailSettings>('crm/mail-settings'),
  saveMail: (body: { from_name: string | null; reply_to: string | null }) => send<MailSettings>('put', 'crm/mail-settings', body),
  aiUsage: () => get<AiUsage>('crm/ai-usage'),
  messengerConfig: () => get<MessengerConfig>('integrations/messenger/config'),
  messengerAccounts: () => get<{ data: MessengerAccount[] }>('integrations/messenger').then(r => r.data),
  listPages: (userToken: string) => send<{ data: PageOption[] }>('post', 'integrations/messenger/list-pages', { user_token: userToken }).then(r => r.data),
  connect: (body: Record<string, unknown>) => send<MessengerAccount>('post', 'integrations/messenger', body),
  reconnect: (id: number, pageToken: string) => send<MessengerAccount>('post', `integrations/messenger/${id}/reconnect`, { page_token: pageToken }),
  verify: (id: number) => send<MessengerAccount>('post', `integrations/messenger/${id}/verify`),
  diagnose: (id: number) => send<{ data: Diagnostic }>('post', `integrations/messenger/${id}/diagnose`).then(r => r.data),
  resubscribe: (id: number) => send<{ status: string }>('post', `integrations/messenger/${id}/resubscribe`),
  simulate: (id: number, text: string) => send<{ status: string; conversation_id?: number }>('post', `integrations/messenger/${id}/simulate-webhook`, { text }),
  disconnect: (id: number) => send<{ status: string }>('delete', `integrations/messenger/${id}`),
}

/** A refusal of this page in our words: its own codes first, then the workspace's (lib/errors). */
export function integrationError(t: TFunction, error: unknown): string {
  switch (failureOf(error).code) {
    case 'label_taken': return t('crm.integrations.errors.label_taken', 'You already have a token with this name.')
    case 'too_many_tokens': return t('crm.integrations.errors.too_many_tokens', 'You have the most tokens one person may hold. Revoke one first.')
    case 'owner_only': return t('crm.integrations.errors.owner_only', 'Only an owner can change this.')
    case 'meta_call_failed': return t('crm.integrations.errors.meta_call_failed', 'Facebook did not accept this. Try again, or reconnect the page.')
    case 'brand_required': return t('crm.integrations.errors.brand_required', 'Add a brand before you connect a page.')
    case 'simulate_failed': return t('crm.integrations.errors.simulate_failed', 'The test message could not be delivered.')
    default: return errorText(t, error)
  }
}
