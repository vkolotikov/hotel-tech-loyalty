import type { TFunction } from 'i18next'
import type { DealColumn, DealFilter, DealSort } from './dealLogic'

/** A won deal's fulfilment step, in the full admin's neutral words (the keys stay the server's). */
export function fulfilmentLabel(t: TFunction, stage: string | null | undefined): string {
  switch (stage) {
    case 'payment_pending': return t('crm.deals.fulfil_payment_pending', 'Awaiting payment')
    case 'design_needed': return t('crm.deals.fulfil_design_needed', 'Preparation')
    case 'design_sent': return t('crm.deals.fulfil_design_sent', 'Review')
    case 'in_production': return t('crm.deals.fulfil_in_production', 'In progress')
    case 'ready_to_ship': return t('crm.deals.fulfil_ready_to_ship', 'Ready')
    case 'completed': return t('crm.deals.fulfil_completed', 'Completed')
    default: return t('crm.deals.fulfil_none', 'Not started')
  }
}

export function paymentLabel(t: TFunction, status: string | null | undefined): string {
  switch (status) {
    case 'pending': return t('crm.deals.pay_pending', 'Not paid')
    case 'invoice_sent': return t('crm.deals.pay_invoice_sent', 'Invoice sent')
    case 'partial': return t('crm.deals.pay_partial', 'Partly paid')
    case 'paid': return t('crm.deals.pay_paid', 'Paid')
    case 'refunded': return t('crm.deals.pay_refunded', 'Refunded')
    default: return t('crm.deals.pay_none', 'No payment yet')
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

export function fulfilmentTone(stage: string | null | undefined): 'success' | 'pending' | 'progress' | 'accent' | 'neutral' {
  switch (stage) {
    case 'completed': return 'success'
    case 'ready_to_ship': return 'accent'
    case 'payment_pending': return 'pending'
    case 'design_needed': case 'design_sent': case 'in_production': return 'progress'
    default: return 'neutral'
  }
}

export function dealFilterLabel(t: TFunction, filter: DealFilter): string {
  switch (filter) {
    case 'payment_pending': return t('crm.deals.filter_awaiting', 'Awaiting payment')
    case 'design_needed': return t('crm.deals.filter_preparation', 'Preparation')
    case 'in_production': return t('crm.deals.filter_in_progress', 'In progress')
    case 'ready_to_ship': return t('crm.deals.filter_ready', 'Ready')
    case 'overdue': return t('crm.deals.filter_overdue', 'Overdue')
    case 'high_value': return t('crm.deals.filter_high_value', 'High value')
    default: return t('crm.common.all', 'All')
  }
}

export function dealSortLabel(t: TFunction, sort: DealSort): string {
  switch (sort) {
    case 'amount': return t('crm.deals.sort_amount', 'Largest first')
    case 'created': return t('crm.deals.sort_created', 'Newest first')
    default: return t('crm.deals.sort_due', 'Next step soonest')
  }
}

export function dealColumnLabel(t: TFunction, column: DealColumn): string {
  switch (column) {
    case 'product_details': return t('crm.deals.col_item', 'What it is for')
    case 'amount': return t('crm.deals.col_amount', 'Amount')
    case 'payment': return t('crm.deals.col_payment', 'Payment')
    case 'fulfillment': return t('crm.deals.col_step', 'Step')
    case 'next_action': return t('crm.deals.col_next', 'Next step')
    case 'due_date': return t('crm.deals.col_due', 'Due')
    default: return t('crm.deals.col_owner', 'Owner')
  }
}
