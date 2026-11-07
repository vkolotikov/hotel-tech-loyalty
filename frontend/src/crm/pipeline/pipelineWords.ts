import type { TFunction } from 'i18next'
import type { DealFilter } from './board'

/** A won deal's fulfilment step, in the full admin's neutral words (the keys stay the server's). */
export function fulfilmentLabel(t: TFunction, stage: string | null | undefined): string {
  switch (stage) {
    case 'payment_pending': return t('crm.pipeline.fulfil_payment_pending', 'Awaiting payment')
    case 'design_needed': return t('crm.pipeline.fulfil_design_needed', 'Preparation')
    case 'design_sent': return t('crm.pipeline.fulfil_design_sent', 'Review')
    case 'in_production': return t('crm.pipeline.fulfil_in_production', 'In progress')
    case 'ready_to_ship': return t('crm.pipeline.fulfil_ready_to_ship', 'Ready')
    case 'completed': return t('crm.pipeline.fulfil_completed', 'Completed')
    default: return t('crm.pipeline.fulfil_none', 'Not started')
  }
}

export function paymentLabel(t: TFunction, status: string | null | undefined): string {
  switch (status) {
    case 'pending': return t('crm.pipeline.pay_pending', 'Not paid')
    case 'invoice_sent': return t('crm.pipeline.pay_invoice_sent', 'Invoice sent')
    case 'partial': return t('crm.pipeline.pay_partial', 'Partly paid')
    case 'paid': return t('crm.pipeline.pay_paid', 'Paid')
    case 'refunded': return t('crm.pipeline.pay_refunded', 'Refunded')
    default: return t('crm.pipeline.pay_none', 'No payment yet')
  }
}

export function paymentTone(status: string | null | undefined): 'success' | 'pending' | 'progress' | 'danger' | 'neutral' {
  switch (status) {
    case 'paid': return 'success'
    case 'partial': return 'progress'
    case 'invoice_sent': case 'pending': return 'pending'
    case 'refunded': return 'danger'
    default: return 'neutral'
  }
}

export function dealFilterLabel(t: TFunction, filter: DealFilter): string {
  switch (filter) {
    case 'payment_pending': return t('crm.pipeline.deals_awaiting', 'Awaiting payment')
    case 'design_needed': return t('crm.pipeline.deals_preparation', 'Preparation')
    case 'in_production': return t('crm.pipeline.deals_in_progress', 'In progress')
    case 'overdue': return t('crm.pipeline.deals_overdue', 'Overdue')
    case 'high_value': return t('crm.pipeline.deals_high_value', 'High value')
    default: return t('crm.common.all', 'All')
  }
}
