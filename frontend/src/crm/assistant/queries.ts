import type { QueryClient } from '@tanstack/react-query'

/** The AI assistant area's query keys, and what a write makes stale. */
export const BEHAVIOUR_KEY = ['crm', 'assistant', 'behaviour'] as const
export const KNOWLEDGE_KEY = ['crm', 'assistant', 'knowledge'] as const
export const GAPS_KEY = ['crm', 'assistant', 'gaps'] as const
export const POPUPS_KEY = ['crm', 'assistant', 'popups'] as const

/** After a write to the knowledge: its lists, and the setup step "Teach it your answers". */
export function knowledgeChanged(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: KNOWLEDGE_KEY })
  void qc.invalidateQueries({ queryKey: ['crm', 'start'] })
  void qc.invalidateQueries({ queryKey: ['crm', 'bootstrap'] })
}
