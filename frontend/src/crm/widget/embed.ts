import type { TFunction } from 'i18next'

/**
 * Putting the chat on a website: what GET widget-config/embed-code answers, the key shortened for display, and where
 * the snippet goes on the common site builders. The snippet itself is always the server's. Pure.
 */
export const EMBED_KEY = ['crm', 'widget', 'embed'] as const

export interface EmbedCode {
  embed_code: string
  iframe_code: string
  widget_key: string
  api_info?: { widget_key: string; api_base: string; endpoints: Record<string, { method: string; url: string }> }
}

/** "3f2a9c1e…b81d": enough of a key to recognise it. */
export function shortKey(key: string | null | undefined): string {
  if (!key) return ''
  return key.length <= 16 ? key : `${key.slice(0, 8)}…${key.slice(-4)}`
}

export const BUILDERS = ['html', 'wordpress', 'wix', 'squarespace', 'shopify', 'webflow'] as const
export type Builder = (typeof BUILDERS)[number]

/** Where the snippet goes, per site builder, in one or two plain sentences. */
export function builderSteps(t: TFunction): { key: Builder; name: string; steps: string }[] {
  return [
    { key: 'html', name: t('crm.widget.install.html', 'Your own HTML'), steps: t('crm.widget.install.html_steps', 'Paste the code just before </body> on every page, or once in the shared footer template.') },
    { key: 'wordpress', name: 'WordPress', steps: t('crm.widget.install.wordpress_steps', 'Use a plugin such as "Insert Headers and Footers" (WPCode): paste the code into the footer box and save.') },
    { key: 'wix', name: 'Wix', steps: t('crm.widget.install.wix_steps', 'Settings → Custom code → Add custom code: paste it, choose "All pages" and "Body – end".') },
    { key: 'squarespace', name: 'Squarespace', steps: t('crm.widget.install.squarespace_steps', 'Settings → Advanced → Code injection: paste it into the Footer box.') },
    { key: 'shopify', name: 'Shopify', steps: t('crm.widget.install.shopify_steps', 'Online store → Themes → Edit code → theme.liquid: paste it just before </body>.') },
    { key: 'webflow', name: 'Webflow', steps: t('crm.widget.install.webflow_steps', 'Site settings → Custom code → Footer code: paste it and publish the site.') },
  ]
}
