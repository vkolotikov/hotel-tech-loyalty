import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { useToast } from '../ui/Toast'
import { useLeadChanged } from './leadData'
import type { Activity, Attachment, ChatHistory, LeadDetail, MetaList } from './leadTypes'

/**
 * The reads a lead's record shares between its header (the tabs' counts) and its tabs, under one cache key each, so a
 * count and the tab it belongs to are one request (round 5). Everything is the full admin's (`inquiries/{id}/…`).
 */

/** The lead (`GET inquiries/{id}`), refreshed as the full admin's lead page refreshes it. */
export function useLeadDetail(id: number) {
  return useQuery({
    queryKey: ['crm', 'leads', 'detail', id],
    queryFn: () => get<LeadDetail>(`inquiries/${id}`),
    enabled: Number.isInteger(id) && id > 0,
    refetchInterval: 15_000,
  })
}

/** A page of the timeline (`GET inquiries/{id}/activities`), newest first, of one kind or all. */
export function useLeadActivities(id: number, kind = '', page = 1) {
  return useQuery({
    queryKey: ['crm', 'leads', 'activities', id, kind, page],
    queryFn: () => get<MetaList<Activity>>(`inquiries/${id}/activities${params({ type: kind, page, per_page: 20 })}`),
    placeholderData: previous => previous,
  })
}

/** The lead's files (`GET inquiries/{id}/attachments`). */
export function useLeadFiles(id: number) {
  return useQuery({
    queryKey: ['crm', 'leads', 'attachments', id],
    queryFn: () => get<{ data: Attachment[] }>(`inquiries/${id}/attachments`).then(r => r.data),
  })
}

/** The website chats the lead's contact had (`GET inquiries/{id}/chat-history`). */
export function useLeadChats(id: number) {
  return useQuery({
    queryKey: ['crm', 'leads', 'chat', id],
    queryFn: () => get<ChatHistory>(`inquiries/${id}/chat-history`),
    staleTime: 60_000,
  })
}

/** One change to the lead (`PUT inquiries/{id}`): the lists and Today hear of it, "Saved" is said. */
export function useLeadWrite(id: number) {
  const { t } = useTranslation()
  const toast = useToast()
  const changed = useLeadChanged()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => send('put', `inquiries/${id}`, body),
    onSuccess: () => { changed(); toast(t('crm.common.saved', 'Saved')) },
    onError: e => toast(errorText(t, e), 'danger'),
  })
}
