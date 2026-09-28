import { loadStripe, type Appearance, type Stripe } from '@stripe/stripe-js'

const cache = new Map<string, Promise<Stripe | null>>()
export function stripeFor(publishableKey: string): Promise<Stripe | null> {
  if (!cache.has(publishableKey)) cache.set(publishableKey, loadStripe(publishableKey))
  return cache.get(publishableKey)!
}

const rgb = (root: HTMLElement | null, name: string, fallback: string) => {
  const v = root ? getComputedStyle(root).getPropertyValue(name).trim() : ''
  return v ? `rgb(${v.split(/\s+/).join(' ')})` : fallback
}

/** Stripe's Payment Element painted with the portal's own tokens. */
export function stripeAppearance(root: HTMLElement | null, dark: boolean): Appearance {
  return {
    theme: dark ? 'night' : 'stripe',
    variables: {
      colorPrimary: rgb(root, '--p-accent', '#2F5D8A'), colorBackground: rgb(root, '--p-surface', dark ? '#0F1113' : '#FFFFFF'),
      colorText: rgb(root, '--p-text', dark ? '#F2F2F0' : '#17191C'), colorTextSecondary: rgb(root, '--p-text-2', '#5F646B'),
      colorDanger: rgb(root, '--p-danger', '#B3261E'), borderRadius: '12px',
      fontFamily: root ? getComputedStyle(root).getPropertyValue('--p-font-body').trim() || 'system-ui, sans-serif' : 'system-ui, sans-serif',
    },
    rules: { '.Input': { borderColor: rgb(root, '--p-border', '#E4E1DA') } },
  }
}
