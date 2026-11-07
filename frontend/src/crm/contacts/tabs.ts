/** Contacts' sections, kept in the address (`?tab=`); People when it names none or one we do not have. */
export const CONTACTS_TABS = ['people', 'companies', 'duplicates'] as const
export type ContactsTab = (typeof CONTACTS_TABS)[number]

export function contactsTab(value: string | null): ContactsTab {
  return (CONTACTS_TABS as readonly string[]).includes(value ?? '') ? (value as ContactsTab) : 'people'
}
