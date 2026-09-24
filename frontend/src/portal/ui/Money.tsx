import { useTranslation } from 'react-i18next'
import { formatMoney } from '../lib/money'

export function Money({ amount, currency, className = '' }: { amount: number; currency: string; className?: string }) {
  const { i18n } = useTranslation()
  return <span className={`tabular-nums ${className}`}>{formatMoney(amount, currency, i18n.language)}</span>
}
