import type { Quality, Rewrite, Variation, Platform } from './types'

export interface ContentMedia { id: number; name: string; mime: string; size: number; url: string; archived: boolean; usage_count: number }
export interface MediaLibrary { media: ContentMedia[]; max_upload_bytes: number }
export interface PlanningSettings { timezone: string; timezone_named: boolean; timezones: string[]; locations_limit: number | null; locations_used: number }
export interface ContentLocation { id: number; name: string; address: string | null; city: string | null; country: string | null; timezone: string; email: string | null; phone: string | null; website: string | null; is_active: boolean }
export type WorkAction = 'write' | 'rewrite' | 'quality' | 'brief' | 'image' | 'fill'
export interface WorkInput { action: WorkAction; request_key: string; post_id?: number; instructions?: string | null; type?: Rewrite; guidance?: string | null; template_id?: number; date?: string; platform?: Platform }
export interface ContentWork { id: number; action: WorkAction; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; post_id: number | null; error: string | null; result: { post_id?: number; variation?: Variation; quality?: Quality } | null; can_cancel: boolean; started_at: string | null; finished_at: string | null }
export const workActive = (work: ContentWork | null | undefined) => work?.status === 'queued' || work?.status === 'running'
