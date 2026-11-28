export interface CampaignFields {
  name: string
  goal: string | null
  brief: string | null
  start_date: string | null
  end_date: string | null
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
}
export interface Campaign extends CampaignFields { id: number }
export const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'completed', 'archived'] as const
