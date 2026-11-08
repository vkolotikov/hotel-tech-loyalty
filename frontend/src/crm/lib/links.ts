/** The sign-in screen, set to bring the visitor back to the CRM page they asked for (/crm/login). */
export { loginPath } from '../../workspace/lib/landing'

/** The interface name. One constant: the owner may rename the product. */
export const APP_NAME = 'HexaTech CRM'

/** Where "Full admin" goes for a full customer: the full admin's Engagement hub (inbox and visitors). */
export const FULL_ADMIN = '/engagement'

export const conversationPath = (id: number): string => `/crm/inbox?c=${id}`
export const leadPath = (id: number): string => `/crm/leads/${id}`
export const contactPath = (id: number): string => `/crm/contacts/${id}`
