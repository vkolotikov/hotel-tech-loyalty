import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Screens converted for Clean light (Tasks 8-14 add their files).
 *
 * Rule: the whole file is scanned, not just style blocks. Comments are
 * stripped first (block comments, and `//` comments that start a line or
 * follow whitespace; a `//` inside a URL is kept), then every hx(…) and
 * hxWhite(…) call is removed. Whatever colour literal remains is reported:
 * `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()`/`hsl()`/`hsla()`
 * with numeric arguments, and `colorScheme: 'dark'`.
 *
 * DATA_COLOURS[file] is a multiset: each listed value allows exactly one
 * occurrence in that file (list a value twice to allow two). Data colours
 * are series palettes, brand swatches, status dots and inline black
 * shadows that read on paper as they are.
 *
 * Known limit: a `//` preceded by whitespace inside a string literal is
 * treated as a comment. Inside JSX text, a colour literal written in prose
 * is reported like any other, which is the intended strictness.
 */
export const CONVERTED_FILES: string[] = [
  'components/Layout.tsx',
  'components/AiChat.tsx',
  'components/GlobalSearch.tsx',
  'components/BrandBadge.tsx',
  'components/BrandRequired.tsx',
  'components/BrandSwitcher.tsx',
  'components/DailyOpsBar.tsx',
  'components/PairTabs.tsx',
  'components/ViewToggle.tsx',
  'components/QuickCreateBookingModal.tsx',
  'hooks/useRealtimeEvents.tsx',
  'pages/Dashboard.tsx',
  'components/ui/Card.tsx',
  'components/ui/DatePicker.tsx',
  'components/ui/TierBadge.tsx',
  'components/AddInquiryDrawer.tsx',
  'components/InquiryDrawer.tsx',
  'components/LeadRow.tsx',
  'components/PipelineInsights.tsx',
  'components/StageBadge.tsx',
  'hooks/useHotLeadAlert.tsx',
  'pages/Deals.tsx',
  'pages/hubs/DealsHub.tsx',
  'pages/Inquiries.tsx',
  'pages/InquiryInsights.tsx',
  'pages/Benefits.tsx',
  'pages/Segments.tsx',
  'pages/Tiers.tsx',
  'pages/ServiceExtras.tsx',
  'pages/ServiceMasters.tsx',
  'pages/Services.tsx',
  'pages/Members.tsx',
  'pages/MemberDetail.tsx',
  'pages/MemberDuplicates.tsx',
  'pages/EarnRateEvents.tsx',
  'pages/Offers.tsx',
  'pages/Referrals.tsx',
  'pages/Rewards.tsx',
  'pages/hubs/MembersHub.tsx',
  'pages/hubs/ProgramHub.tsx',
  'pages/hubs/RewardsHub.tsx',
  'components/MemberPortalLinkCard.tsx',
  'components/MembersOnboarding.tsx',
  'components/MemberImportWizard.tsx',
  'components/settings/BookingTab.tsx',
  'pages/BookingCalendar.tsx',
  'pages/BookingDetail.tsx',
  'pages/BookingExtras.tsx',
  'pages/BookingPayments.tsx',
  'pages/BookingRooms.tsx',
  'pages/Bookings.tsx',
  'pages/BookingSubmissions.tsx',
  'pages/CalendarUnified.tsx',
  'pages/ServiceBookingCalendar.tsx',
  'pages/ServiceBookings.tsx',
  'pages/Venues.tsx',
  'pages/Properties.tsx',
  'pages/CampaignDetail.tsx',
  'pages/ChatInbox.tsx',
  'pages/ChatbotAnalytics.tsx',
  'pages/ChatbotConfig.tsx',
  'pages/ChatbotSetup.tsx',
  'pages/ChatbotTestAi.tsx',
  'pages/ChatbotWidget.tsx',
  'pages/EmailCampaigns.tsx',
  'pages/EmailTemplates.tsx',
  'pages/Engagement.tsx',
  'pages/EngagementLive.tsx',
  'pages/KnowledgeBase.tsx',
  'pages/Notifications.tsx',
  'pages/PopupRules.tsx',
  'pages/ReviewDetail.tsx',
  'pages/ReviewFormBuilder.tsx',
  'pages/Reviews.tsx',
  'pages/Training.tsx',
  'pages/Visitors.tsx',
  'pages/CannedReplies.tsx',
  'pages/hubs/CampaignsHub.tsx',
  'pages/hubs/MarketingHub.tsx',
  'components/ChatHistoryPanel.tsx',
  'components/EmailBlockBuilder.tsx',
  'components/EngagementDrawer.tsx',
  'components/SendReviewButton.tsx',
  'components/SurveyDesignPanel.tsx',
  'components/ChatGptConnectionsPanel.tsx',
  'components/chatbot/ChatbotWizard.tsx',
  'components/ContentPlanner/Dashboard.tsx',
  'components/ContentPlanner/PostsView.tsx',
  'components/ContentPlanner/StrategyView.tsx',
  'components/ContentPlanner/CalendarView.tsx',
  'components/PlannerDaySidebar.tsx',
  'components/PlannerStats.tsx',
  'components/PoolManager.tsx',
  'pages/Planner.tsx',
  'components/BacklogStrip.tsx',
  'components/TeamBucketsView.tsx',
  'components/PlannerSettings.tsx',
  'pages/Tasks.tsx',
  'pages/Analytics.tsx',
  'pages/Reports.tsx',
  'pages/AiInsights.tsx',
  'components/AiUsagePanel.tsx',
  'components/ApiTokensPanel.tsx',
  'components/DocumentationCenter.tsx',
  'pages/Brands.tsx',
  'pages/Settings.tsx',
  'pages/Billing.tsx',
  'pages/AuditLog.tsx',
  'pages/landing/LandingEditor.tsx',
  'pages/landing/DesignPanel.tsx',
  'pages/landing/LandingPreview.tsx',
  'pages/landing/LandingTeardown.tsx',
  'pages/landing/LandingWizard.tsx',
  'components/settings/StylePicker.tsx',
  'components/MenuSettings.tsx',
  'components/TeamSettings.tsx',
  'components/PipelinesAdmin.tsx',
]
export const DATA_COLOURS: Record<string, string[]> = {
  'components/Layout.tsx': [
    '#60a5fa', '#a78bfa', '#38bdf8', '#fbbf24', '#ef4444', '#fff',
  ],
  'components/BrandBadge.tsx': [
    '#666',
  ],
  'components/PairTabs.tsx': [
    '#74c895', '#5ab4b2', '#03050a', 'rgba(116,200,149,0.2)',
  ],
  'components/ViewToggle.tsx': [
    '#74c895', '#5ab4b2', '#03050a', 'rgba(116,200,149,0.2)',
  ],
  'components/QuickCreateBookingModal.tsx': [
    '#74c895', '#5ab4b2', '#03050a', 'rgba(116,200,149,0.2)',
  ],
  'hooks/useRealtimeEvents.tsx': [
    'rgba(251,146,60,0.18)', 'rgba(251,146,60,0.08)', 'rgba(251,146,60,0.5)', 'rgba(0,0,0,0.4)',
  ],
  'pages/Dashboard.tsx': [
    '#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#f43f5e', '#3b82f6', '#94a3b8', '#8e8e93', '#c0c0c0', '#ffd700', '#9e9e9e', '#00bcd4', '#ff375f', '#f59e0b', '#a855f7', '#3b82f6', '#06b6d4', '#32d74b', '#8e8e93', '#8e8e93', '#ff375f', '#8e8e93', '#8e8e93', '#9a7ef0', '#9a7ef0', '#9a7ef0', '#3b82f6', '#10b981', '#06b6d4', '#a855f7', '#3b82f6', '#10b981', '#06b6d4', '#9a7ef0', '#f59e0b', '#ec4899', '#a855f7', '#c9a84c',
  ],
  'components/ui/TierBadge.tsx': [
    '#ffd700', '#c0c0c0', '#e5e4e2', '#b9f2ff', '#333',
  ],
  'components/AddInquiryDrawer.tsx': [
    '#c9a84c', '#22d3ee', '#3b82f6', '#a855f7', '#10b981', '#a78bfa', 'rgba(201,168,76,0.10)', 'rgba(201,168,76,0.02)',
  ],
  'components/InquiryDrawer.tsx': [
    '#f5d782', '#c9a84c', '#c9a84c', '#10b981', '#3b82f6', '#a855f7', '#34d399', '#10b981', '#34d399', '#22d3ee', '#a855f7', '#64748b', 'rgba(201, 168, 76, 0.35)',
  ],
  'components/LeadRow.tsx': [
    '#ef4444', '#74c895', 'rgba(107,114,128,0.6)',
  ],
  'hooks/useHotLeadAlert.tsx': [
    'rgba(251,146,60,0.18)', 'rgba(251,146,60,0.08)', 'rgba(251,146,60,0.45)', 'rgba(0,0,0,0.4)',
  ],
  'pages/Deals.tsx': [
    '#f59e0b', '#a855f7', '#3b82f6', '#0ea5e9', '#10b981', '#22c55e', '#74c895', '#666', '#a0a0a0', '#666', '#666', '#a0a0a0', '#666',
  ],
  'pages/hubs/DealsHub.tsx': [
    '#c9a84c', '#f87171', '#60a5fa', '#22d3ee', '#fb923c', '#34d399', '#c9a84c', '#f87171', '#38bdf8', '#34d399',
  ],
  'pages/Inquiries.tsx': [
    '#74c895', '#5ab4b2', '#03050a', '#ef4444', '#3b82f6', 'rgba(0,0,0,0.2)', 'rgba(116,200,149,0.2)', 'rgba(0,0,0,0.5)',
  ],
  'pages/Benefits.tsx': [
    '#32d74b', '#48484a',
  ],
  'pages/Segments.tsx': [
    '#666',
  ],
  'pages/Tiers.tsx': [
    '#c0c0c0', '#c0c0c0', '#666', '#666',
  ],
  'pages/ServiceExtras.tsx': [
    '#74c895', '#74c895', '#000', '#03050a',
  ],
  'pages/ServiceMasters.tsx': [
    '#74c895', '#74c895', '#000', '#03050a',
  ],
  'pages/Services.tsx': [
    '#74c895', '#74c895', '#74c895', '#000', '#03050a', '#374151', '#374151', '#9ca3af', '#9ca3af',
  ],
  'pages/Members.tsx': [
    '#c9a84c',
  ],
  'pages/Referrals.tsx': [
    '#5ac8fa', '#32d74b', '#c9a84c', '#8b5cf6',
  ],
  'components/settings/BookingTab.tsx': [
    '#2d6a4f', '#c9a84c', '#2d6a4f', '#ffffff', '#1a1a1a', '#1a1a2e', '#ffffff', '#fff', '#1a1a1a', '#aaa', '#666', '#aaa', '#666', '#fff', 'rgba(34,197,94,0.15)', 'rgba(34,197,94,0.2)', 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.08)', 'rgba(255,255,255,0.04)', 'rgba(0,0,0,0.03)', 'rgba(255,255,255,0.06)', 'rgba(0,0,0,0.06)',
  ],
  'pages/BookingCalendar.tsx': [
    '#5ab4b2', '#d98f45', '#74c895', '#81a6e8', '#d5c06a', '#22c55ecc', '#16a34acc', '#ef4444cc', '#dc2626cc', '#ef4444cc', '#dc2626cc', '#f59e0bcc', '#d97706cc', '#14b8a6cc', '#0d9488cc', '#6b7280cc', '#4b5563cc', '#74c895', '#5ab4b2', '#03050a', '#22c55e', '#ef4444', '#f59e0b', '#14b8a6', '#22c55e', '#f59e0b', '#14b8a6', 'rgba(90,180,178,0.14)', 'rgba(90,180,178,0.22)', 'rgba(217,143,69,0.14)', 'rgba(217,143,69,0.22)', 'rgba(116,200,149,0.14)', 'rgba(116,200,149,0.2)', 'rgba(129,166,232,0.14)', 'rgba(129,166,232,0.22)', 'rgba(213,192,106,0.14)', 'rgba(213,192,106,0.22)', 'rgba(34,197,94,0.4)', 'rgba(239,68,68,0.4)', 'rgba(239,68,68,0.4)', 'rgba(245,158,11,0.4)', 'rgba(20,184,166,0.4)', 'rgba(107,114,128,0.4)', 'rgba(116,200,149,0.2)', 'rgba(116,200,149,0.12)', 'rgba(116,200,149,0.3)', 'rgba(0,0,0,0.18)', 'rgba(116,200,149,0.08)', 'rgba(217,143,69,0.04)', 'rgba(116,200,149,0.04)', 'rgba(217,143,69,0.02)', 'rgba(0,0,0,0.2)',
  ],
  'pages/BookingDetail.tsx': [
    '#74c895', '#d98f45', '#5ab4b2', '#03050a', 'rgba(0,0,0,0.18)',
  ],
  'pages/BookingExtras.tsx': [
    '#74c895', '#74c895', '#000', '#03050a',
  ],
  'pages/BookingPayments.tsx': [
    'rgba(116,200,149,0.12)', 'rgba(0,0,0,0.18)', 'rgba(116,200,149,0.06)', 'rgba(0,0,0,0.12)',
  ],
  'pages/BookingRooms.tsx': [
    '#74c895', '#74c895', '#000', '#03050a', '#74c895',
  ],
  'pages/Bookings.tsx': [
    '#74c895', '#f0b56f', '#5ab4b2', '#e4846f', '#d5c06a', '#81a6e8', '#f0b56f', '#d98f45', '#74c895cc', '#5ab4b2cc', 'rgba(90,180,178,0.5)', 'rgba(90,180,178,0.3)', 'rgba(217,143,69,0.25)', 'rgba(90,180,178,0.2)',
  ],
  'pages/BookingSubmissions.tsx': [
    'rgba(116,200,149,0.12)', 'rgba(0,0,0,0.18)', 'rgba(116,200,149,0.06)', 'rgba(228,132,111,0.06)', 'rgba(0,0,0,0.12)',
  ],
  'pages/CalendarUnified.tsx': [
    '#74c895', '#74c895', '#5ab4b2', '#5ab4b2', '#d98f45', '#d98f45', 'rgba(116,200,149,0.14)', 'rgba(116,200,149,0.35)', 'rgba(90,180,178,0.14)', 'rgba(90,180,178,0.35)', 'rgba(217,143,69,0.14)', 'rgba(217,143,69,0.35)', 'rgba(116,200,149,0.12)', 'rgba(116,200,149,0.05)', 'rgba(217,143,69,0.02)', 'rgba(116,200,149,0.05)',
  ],
  'pages/ServiceBookingCalendar.tsx': [
    '#facc15', '#facc15', '#74c895', '#74c895', '#5ab4b2', '#5ab4b2', '#60a5fa', '#60a5fa', '#f87171', '#f87171', '#94a3b8', '#94a3b8', '#74c895', '#5ab4b2', '#03050a', 'rgba(234,179,8,0.14)', 'rgba(234,179,8,0.35)', 'rgba(116,200,149,0.14)', 'rgba(116,200,149,0.35)', 'rgba(90,180,178,0.14)', 'rgba(90,180,178,0.35)', 'rgba(59,130,246,0.14)', 'rgba(59,130,246,0.35)', 'rgba(239,68,68,0.12)', 'rgba(239,68,68,0.3)', 'rgba(148,163,184,0.12)', 'rgba(148,163,184,0.3)', 'rgba(116,200,149,0.12)', 'rgba(116,200,149,0.2)', 'rgba(116,200,149,0.05)', 'rgba(217,143,69,0.02)', 'rgba(116,200,149,0.04)', 'rgba(217,143,69,0.02)', 'rgba(116,200,149,0.04)', 'rgba(116,200,149,0.03)', 'rgba(0,0,0,0.1)',
  ],
  'pages/ServiceBookings.tsx': [
    '#74c895', '#74c895', '#000', '#03050a', 'rgba(0,0,0,0.5)',
  ],
  'pages/CampaignDetail.tsx': [
    '#2a2a2a', '#666', '#a0a0a0', '#666', '#a0a0a0', '#1a1a1a', '#2a2a2a', '#fff', '#6366f1',
  ],
  'pages/ChatbotAnalytics.tsx': [
    '#1a1a2e', '#2e2e50', '#fff', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#32d74b', '#ef4444', '#06b6d4', '#636366', '#2e2e50', '#8e8e93', '#3b82f6', '#3b82f6', '#3b82f6', '#22c55e', '#8e8e93', '#a855f7', '#a855f7', '#a855f7', '#22c55e', 'rgba(255,255,255,0.04)', 'rgba(99,102,241,0.08)', '#6366f1', '#22c55e', '#f59e0b', 'rgba(34,197,94,0.08)', '#6366f1', '#22c55e', '#f59e0b',
  ],
  'pages/ChatbotSetup.tsx': [
    '#a78bfa', '#fbbf24', '#34d399', '#22d3ee', '#fb923c', '#f472b6', '#60a5fa',
  ],
  'pages/ChatbotWidget.tsx': [
    '#c9a84c', '#2d6a4f', '#1d4ed8', '#7c3aed', '#dc2626', '#0891b2', '#ea580c', '#16a34a', '#4f46e5', '#be185d', '#ffffff', '#f9fafb', '#1f2937', '#c9a84c', '#f3f4f6', '#1f2937', '#ffffff', '#ffffff', '#0f0c08', '#1a1410', '#f5e8c6', '#c9a84c', '#c9a84c', '#8a6f2d', '#1a1410', '#f5e8c6', '#0f0c08', '#ffffff', '#fafaf9', '#f5f5f4', '#1c1917', '#1f1f1f', '#1f1f1f', '#f5f5f4', '#1c1917', '#fafaf9', '#ffffff', '#ffffff', '#ecfdf5', '#064e3b', '#10b981', '#10b981', '#065f46', '#ecfdf5', '#064e3b', '#ffffff', '#ffffff', '#0f172a', '#1e293b', '#e0e7ff', '#6366f1', '#6366f1', '#0f172a', '#1e293b', '#e0e7ff', '#0f172a', '#ffffff', '#fffbf7', '#fdf2f8', '#831843', '#be185d', '#be185d', '#831843', '#fdf2f8', '#831843', '#fffbf7', '#ffffff', '#f0fdff', '#ecfeff', '#164e63', '#0891b2', '#0891b2', '#155e75', '#ecfeff', '#164e63', '#f0fdff', '#ffffff', '#0f172a', '#1e293b', '#fde68a', '#d97706', '#d97706', '#1e293b', '#1e293b', '#fde68a', '#0f172a', '#ffffff', '#c9a84c', '#c9a84c', '#c9a84c', '#fff', 'rgba(0,0,0,0.06)', '#f3f4f6', '#f3f4f6', '#fff', '#7c3aed', '#ffffff', '#ffffff', '#f3f4f6', '#1f2937', '#ffffff', '#000000', '#636366', '#c9a84c', '#ffffff', '#ffffff', '#f3f4f6', '#1f2937', '#ffffff', '#10b981', '#f59e0b', '#6b7280', '#eef0f4', 'rgba(0,0,0,0.09)', 'rgba(0,0,0,0.07)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.3)', 'rgba(255,255,255,0.2)', '#22c55e', '#fff', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.04)', '#9ca3af', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.3)',
  ],
  'pages/EmailCampaigns.tsx': [
    '#888', '#f0f0f0',
  ],
  'pages/EngagementLive.tsx': [
    '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  ],
  'pages/ReviewFormBuilder.tsx': [
    '#f59e0b', '#eab308', '#06b6d4', '#8b5cf6', '#f97316', '#ec4899', '#14b8a6', '#10b981', '#3b82f6',
  ],
  'pages/hubs/MarketingHub.tsx': [
    '#a78bfa', '#f472b6', '#c9a84c', '#8b5cf6',
  ],
  'components/EmailBlockBuilder.tsx': [
    '#1a1a1a', '#555555', '#c9a84c', '#0e0e0e', '#e5e5e5', '#ffffff', '#1a1a1a', '#c9a84c', '#1a1a1a', '#555555', '#e5e5e5', '#1a1a1a', '#555555', '#1a1a1a', '#555555', '#c9a84c', '#0e0e0e', '#1a1a1a', '#1a1a1a', '#555555', '#c9a84c', '#888888', '#1a1a1a', '#ffffff', '#c9a84c', '#1a1a1a', '#1a1a1a', '#555555', '#1a1a1a', '#888888', '#c9a84c', '#0e0e0e', '#0e0e0e', '#0e0e0e', '#1a1a1a', '#555555', '#555555', '#888888', '#1a1a1a', '#555555',
  ],
  'components/SurveyDesignPanel.tsx': [
    '#2563eb', '#38bdf8', '#4f46e5', '#a855f7', '#f97316', '#ec4899', '#047857', '#84cc16', '#0f172a', '#334155', '#334155', '#64748b', '#334155', '#64748b', '#ffffff', '#ffffff', '#2563eb',
  ],
  'components/ContentPlanner/Dashboard.tsx': [
    '#8b5cf6', '#60a5fa', '#10b981', '#22c55e', '#9ca3af', '#9ca3af', 'rgba(139,92,246,0.15)', 'rgba(156,163,175,0.15)',
  ],
  'components/ContentPlanner/PostsView.tsx': [
    '#9ca3af', '#9ca3af', '#34d399', '#fbbf24', '#f87171', '#0b0b0e', '#9ca3af', '#34d399', '#f87171', '#fbbf24', '#34d399', '#fbbf24', '#f87171', 'rgba(156,163,175,0.15)', 'rgba(52,211,153,0.15)', 'rgba(248,113,113,0.15)', 'rgba(251,191,36,0.15)',
  ],
  'components/ContentPlanner/StrategyView.tsx': [
    '#9ca3af', '#9ca3af', '#9ca3af', '#6b7280',
  ],
  'components/ContentPlanner/CalendarView.tsx': [
    '#9ca3af', '#9ca3af', '#9ca3af', '#9ca3af', 'rgba(156,163,175,0.15)', 'rgba(156,163,175,0.15)',
  ],
  'components/PlannerDaySidebar.tsx': [
    '#22c55e', '#3b82f6', '#ef4444', '#9ca3af', '#1f2937',
  ],
  'components/PlannerStats.tsx': [
    '#1a1a2e', '#2e2e50', '#ffffff', '#ffffff10', '#6b7280', '#9ca3af', '#12121f', '#ef4444', '#3b82f6', '#9ca3af', '#c9a84c', '#c9a84c', '#10b981', '#10b981', '#f59e0b', '#f59e0b', '#10b981', '#c9a84c', '#10b981', '#6b7280', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#4b5563', '#4b5563', '#4b5563', '#10b981', '#f59e0b', '#6b7280', '#10b981', '#4b5563', '#6b7280', '#10b981', 'rgba(255,255,255,0.05)', 'rgba(16,185,129,${alpha})', 'rgba(16,185,129,${a})',
  ],
  'components/PoolManager.tsx': [
    '#a78bfa', '#3b82f6', '#94a3b8', '#00000055',
  ],
  'pages/Planner.tsx': [
    '#6b7280', '#3b82f6', '#ef4444', '#3b82f6', '#ef4444', '#22c55e', '#fbbf24', '#6b7280', '#a78bfa', '#22c55e', '#ef4444', '#f59e0b', '#0ea5e9', '#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#10b981', '#c9a84c', 'rgba(167,139,250,0.10)', 'rgba(167,139,250,0.25)', 'rgba(34,197,94,0.10)', 'rgba(34,197,94,0.25)', 'rgba(239,68,68,0.10)', 'rgba(239,68,68,0.25)', 'rgba(245,158,11,0.10)', 'rgba(245,158,11,0.25)', 'rgba(14,165,233,0.10)', 'rgba(14,165,233,0.25)', 'rgba(59,130,246,0.10)', 'rgba(59,130,246,0.25)', 'rgba(201,168,76,0.18)', 'rgba(201,168,76,0.04)', 'rgba(201,168,76,0.3)', 'rgba(16,185,129,0.08)', 'rgba(168,85,247,0.15)', 'rgba(168,85,247,0.35)',
  ],
  'components/PlannerSettings.tsx': [
    '#94a3b8', '#94a3b8', '#94a3b8',
  ],
  'pages/Tasks.tsx': [
    '#22d3ee', '#a78bfa', '#fbbf24', '#34d399', '#94a3b8', '#f472b6', '#94a3b8', '#3b82f6', '#ef4444', '#f59e0b', '#22d3ee', '#10b981', '#94a3b8', '#ef4444', '#f59e0b', '#3b82f6', '#22d3ee', '#94a3b8', '#94a3b8', '#10b981',
  ],
  'pages/Analytics.tsx': [
    '#cd7f32', '#c0c0c0', '#ffd700', '#6b6b6b', '#00bcd4', '#1a1a2e', '#2e2e50', '#fff', '#8e8e93', '#2c2c2c', '#8e8e93', '#e5e7eb', '#fff', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#32d74b', '#636366', '#06b6d4', '#ef4444', '#4285f4', '#34a853', '#1877f2', '#e1306c', '#69c9d0', '#f59e0b', '#22d3ee', '#a855f7', '#6b7280', '#636366', '#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#c9a84c', '#c9a84c', '#32d74b', '#32d74b', '#c9a84c', '#32d74b', '#8b5cf6', '#c9a84c', '#9a7a30', '#3b82f6', '#32d74b', '#c9a84c', '#c9a84c', '#32d74b', '#32d74b', '#c9a84c', '#32d74b', '#c9a84c', '#32d74b', '#8b5cf6', '#8b5cf6', '#6366f1', '#f59e0b', '#c9a84c', '#9a7a30', '#6366f1', '#666', '#a0a0a0', '#666', '#a0a0a0', '#666', '#a0a0a0', '#6366f1', '#32d74b', '#32d74b', '#32d74b', '#32d74b', '#8b5cf6', '#6366f1', '#f59e0b', '#f59e0b', '#32d74b', '#6366f1', '#6366f1', '#c9a84c', '#c9a84c', '#06b6d4', '#c9a84c', '#c9a84c', '#3b82f6', '#3b82f6', '#c9a84c', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#10b981', '#10b981', '#f59e0b', '#3b82f6', '#10b981', 'rgba(255,255,255,0.04)', 'rgba(50,215,75,0.25)', 'rgba(255,159,10,0.25)', 'rgba(239,68,68,0.18)', '#2e2e50', '#636366',
  ],
  'pages/Reports.tsx': [
    '#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#a78bfa', '#f472b6', '#94a3b8', '#3b82f6', '#6366f1', '#a855f7', '#eab308', '#f59e0b', '#fb923c', '#22c55e', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#a855f7', '#94a3b8', '#27272a', '#94a3b8', '#0a0a0a', '#27272a', '#22d3ee', '#10b981', '#3b82f6', '#ef4444',
  ],
  'components/AiUsagePanel.tsx': [
    '#a3a3a3', '#22c55e', '#f59e0b', '#ef4444', 'rgba(163,163,163,0.10)', 'rgba(34,197,94,0.12)', 'rgba(245,158,11,0.12)', 'rgba(239,68,68,0.12)',
  ],
  'components/DocumentationCenter.tsx': [
    '#60a5fa', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#a78bfa', '#c084fc', '#f97316', '#fbbf24', '#8b5cf6', '#22d3ee', '#f97316', '#9ca3af', '#a78bfa', '#fbbf24', '#f472b6', '#22d3ee', '#60a5fa', '#9ca3af', '#9ca3af', 'rgba(116,200,149,0.12)', 'rgba(116,200,149,0.02)', 'rgba(116,200,149,0.18)', 'rgba(168,85,247,0.10)', 'rgba(168,85,247,0.02)', 'rgba(168,85,247,0.16)', 'rgba(168,85,247,0.18)', 'rgba(168,85,247,0.35)',
  ],
  'pages/Brands.tsx': [
    '#c9a84c', '#c9a84c',
  ],
  'pages/Settings.tsx': [
    '#cd7f32', '#c0c0c0', '#ffd700', '#6b6b6b', '#00bcd4', '#c9a84c', '#1e1e1e', '#32d74b', '#0d0d0d', '#161616', '#ffffff', '#8e8e93', '#2c2c2c', '#ff375f', '#ffd60a', '#0a84ff', '#3b82f6', '#1e293b', '#22c55e', '#0f172a', '#1e293b', '#f8fafc', '#94a3b8', '#334155', '#ef4444', '#eab308', '#06b6d4', '#10b981', '#1a2332', '#f59e0b', '#0c1117', '#141e29', '#f0fdf4', '#86efac', '#1e3a2f', '#f43f5e', '#fbbf24', '#38bdf8', '#e11d48', '#1c1017', '#fb923c', '#0f0708', '#1c1017', '#fff1f2', '#fda4af', '#3b1524', '#dc2626', '#facc15', '#60a5fa', '#06b6d4', '#0f2937', '#a78bfa', '#0a1a24', '#0f2937', '#ecfeff', '#67e8f9', '#164e63', '#fb7185', '#fde047', '#818cf8', '#8b5cf6', '#1a1625', '#f472b6', '#0e0b16', '#1a1625', '#f5f3ff', '#a78bfa', '#2e1f4d', '#f43f5e', '#fbbf24', '#22d3ee', '#f97316', '#1f1410', '#fbbf24', '#120906', '#1f1410', '#fff7ed', '#fdba74', '#3b1f12', '#ef4444', '#facc15', '#38bdf8', '#16a34a', '#0f1a14', '#84cc16', '#08120c', '#0f1a14', '#f0fdf4', '#86efac', '#1a2e22', '#dc2626', '#eab308', '#0ea5e9', '#d4af37', '#1c1814', '#e5c494', '#100e0a', '#1c1814', '#fdf6e3', '#c4a476', '#2e2820', '#e25555', '#f5b400', '#5ec4e8', '#64748b', '#0f172a', '#06b6d4', '#020617', '#0f172a', '#f1f5f9', '#94a3b8', '#1e293b', '#f43f5e', '#facc15', '#0ea5e9', '#14b8a6', '#0a1f1d', '#fde047', '#04110f', '#0a1f1d', '#f0fdfa', '#5eead4', '#13332e', '#fb7185', '#facc15', '#38bdf8', '#9f1239', '#1a0a0f', '#d4af37', '#0e0608', '#1a0a0f', '#fff1f2', '#e8aab6', '#3b1220', '#dc2626', '#eab308', '#60a5fa', '#0ea5e9', '#0f1a23', '#a78bfa', '#050b12', '#0f1a23', '#f0f9ff', '#7dd3fc', '#1e3a52', '#f43f5e', '#fbbf24', '#22d3ee', '#3b82f6', '#0a0a0a', '#22d3ee', '#000000', '#0a0a0a', '#fafafa', '#737373', '#1a1a1a', '#ef4444', '#eab308', '#06b6d4', '#22c55e', '#60a5fa', '#f59e0b', '#f472b6', '#22d3ee', '#c9a84c', '#fb923c', '#fbbf24', '#a78bfa', '#34d399', '#38bdf8', '#22d3ee', '#a78bfa', '#c084fc', '#f87171', '#9ca3af', '#000000', '#000000', '#3b82f6', '#0d0d0d', '#161616', '#ffffff', '#8e8e93', '#2c2c2c', '#32d74b', '#ff375f', '#c9a84c', '#0d0d0d', '#161616', '#1e1e1e', '#ffffff', '#8e8e93', '#2c2c2c', '#32d74b', '#ff375f', '#ffd60a', '#0a84ff', '#c9a84c', '#0d0d0d', '#161616', '#1e1e1e', '#ffffff', '#8e8e93', '#2c2c2c', '#32d74b', '#ff375f', '#ffd60a', '#0a84ff', '#3b82f6', '#0a0f1e', '#111827', '#1f2937', '#f8fafc', '#94a3b8', '#1f2a3a', '#22c55e', '#ef4444', '#eab308', '#06b6d4', '#10b981', '#06120c', '#0f1f17', '#162a1f', '#f0fdf4', '#86efac', '#1e3a2f', '#22c55e', '#f43f5e', '#fbbf24', '#38bdf8', '#e11d48', '#0f0708', '#1c1017', '#2a1620', '#fff1f2', '#fda4af', '#3b1524', '#10b981', '#dc2626', '#facc15', '#60a5fa', '#06b6d4', '#04141c', '#0f2937', '#163847', '#ecfeff', '#67e8f9', '#164e63', '#22c55e', '#fb7185', '#fde047', '#818cf8', '#d4af37', '#100e0a', '#1c1814', '#2a2418', '#fdf6e3', '#c4a476', '#2e2820', '#22c55e', '#e25555', '#f5b400', '#5ec4e8', '#8b5cf6', '#0c0a14', '#15112a', '#1e1836', '#f5f3ff', '#a78bfa', '#2e2654', '#34d399', '#f87171', '#fbbf24', '#38bdf8', '#f97316', '#120a06', '#1e1410', '#2a1e18', '#fff7ed', '#fdba74', '#3d2a1e', '#4ade80', '#ef4444', '#fde047', '#67e8f9', '#78716c', '#0e0d0b', '#1c1a17', '#292521', '#fafaf9', '#a8a29e', '#33302c', '#86efac', '#fca5a5', '#fcd34d', '#93c5fd', '#f5f5f5', '#09090b', '#141416', '#1e1e22', '#fafafa', '#71717a', '#27272a', '#22c55e', '#ef4444', '#eab308', '#3b82f6', '#c2410c', '#0f0a07', '#1a140e', '#261e16', '#fef3c7', '#d6a56a', '#3b2e20', '#4ade80', '#fb923c', '#fde68a', '#7dd3fc', '#0ea5e9', '#070c10', '#0e1620', '#162032', '#f0f9ff', '#7dd3fc', '#1e3048', '#34d399', '#fb7185', '#fde047', '#a78bfa', '#000', '#fbbf24', '#a78bfa', '#60a5fa', '#74c895', '#f59e0b', '#fbbf24', '#60a5fa', '#a78bfa', '#74c895', '#94a3b8', '#9ca3af', 'rgba(255,255,255,${alpha})', 'rgba(0,0,0,0.18)', 'rgba(116,200,149,0.2)', 'rgba(116,200,149,0.05)', 'rgba(0,0,0,0.12)', 'rgba(116,200,149,0.12)', 'rgba(116,200,149,0.12)', 'rgba(116,200,149,0.25)', 'rgba(116,200,149,0.1)',
  ],
  'pages/landing/LandingEditor.tsx': [
    '#6b7280',
  ],
  'components/settings/StylePicker.tsx': [
    '#0b1120', '#0d1426', '#0a0f1c', '#f3f6fb', '#c3ccd9', '#0d0d0d', '#161616', '#2c2c2c', '#ffffff', '#8e8e93', '#f5f5f7', '#ffffff', '#e5e5ea', '#1d1d1f', '#6e6e73', 'rgb(255 255 255 / 0.08)', 'rgb(255 255 255 / 0.16)', 'rgb(255 255 255 / 0.1)', 'rgb(0 0 0 / 0.06)',
  ],
  'components/MenuSettings.tsx': [
    '#a78bfa', '#38bdf8', '#fbbf24', '#34d399', '#f472b6', '#22d3ee',
  ],
  'components/TeamSettings.tsx': [
    '#fbbf24', '#a78bfa', '#22d3ee',
  ],
  'components/PipelinesAdmin.tsx': [
    '#3b82f6', '#22c55e', '#ef4444', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#10b981', '#14b8a6', '#22d3ee', '#94a3b8', '#3b82f6',
  ],
}

const SRC = path.resolve(__dirname, '..')

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g
const FUNC = /\b(?:rgb|hsl)a?\(\s*\d[^)]*\)/g
const SCHEME = /colorScheme:\s*['"]dark['"]/g

function stripComments(source: string): string {
  return source
    .replace(/\/\*[^]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
}

/** Colour literals left in `source` after hx()/hxWhite() calls are removed, lowercased, with the multiset `allowed` consumed first. */
export function unconvertedColours(source: string, allowed: string[] = []): string[] {
  const code = stripComments(source)
    .replace(/&#\d+;/g, '')
    .replace(/&#x[0-9a-fA-F]+;/g, '')
    .replace(/\bhx(?:White)?\([^)]*\)/g, '')
  const found = [
    ...[...code.matchAll(HEX)].map(m => m[0]),
    ...[...code.matchAll(FUNC)].map(m => m[0]),
    ...[...code.matchAll(SCHEME)].map(() => "colorScheme: 'dark'"),
  ].map(v => v.toLowerCase())
  const budget = allowed.map(v => v.toLowerCase())
  return found.filter(v => {
    const i = budget.indexOf(v)
    if (i === -1) return true
    budget.splice(i, 1)
    return false
  })
}

function literalsIn(file: string): string[] {
  const s = fs.readFileSync(path.join(SRC, file), 'utf8')
  return unconvertedColours(s, DATA_COLOURS[file] ?? [])
}

describe('Clean light sweep', () => {
  it.each(CONVERTED_FILES.length ? CONVERTED_FILES : ['(none yet)'])('%s has no unconverted inline colour', file => {
    if (file === '(none yet)') return
    expect(literalsIn(file)).toEqual([])
  })
})

describe('Clean light sweep detection', () => {
  it('catches a hex inside a border shorthand', () => {
    expect(unconvertedColours(`style={{ border: '1px solid #333' }}`)).toEqual(['#333'])
  })

  it('catches a typed multi-line style constant', () => {
    const src = `const card: React.CSSProperties = {\n  background: '#1a1a1a',\n  color: 'x',\n}`
    expect(unconvertedColours(src)).toEqual(['#1a1a1a'])
  })

  it('catches both stops of a gradient', () => {
    expect(unconvertedColours(`background: 'linear-gradient(#111, #222)'`)).toEqual(['#111', '#222'])
  })

  it('catches rgba and hsl calls', () => {
    expect(unconvertedColours(`boxShadow: '0 0 0 rgba(0,0,0,0.4)'`)).toEqual(['rgba(0,0,0,0.4)'])
    expect(unconvertedColours(`color: 'hsl(0 0% 10%)'`)).toEqual(['hsl(0 0% 10%)'])
  })

  it("catches colorScheme: 'dark'", () => {
    expect(unconvertedColours(`style={{ colorScheme: 'dark' }}`)).toEqual(["colorscheme: 'dark'"])
  })

  it('ignores hx() and hxWhite() calls', () => {
    expect(unconvertedColours(`a: hx('f', '#2c2c2c', 0.5), b: hxWhite(0.06)`)).toEqual([])
  })

  it('ignores a hex inside a block comment', () => {
    expect(unconvertedColours(`/* old colour #abcdef */\nconst x = 1`)).toEqual([])
  })

  it('keeps a // inside a URL but drops a trailing line comment', () => {
    expect(unconvertedColours(`href: 'https://example.com/#abc'`)).toEqual(['#abc'])
    expect(unconvertedColours(`const a = 1 // was #123456`)).toEqual([])
  })

  it('ignores numeric HTML entities in JSX text', () => {
    expect(unconvertedColours(`<p>Don&#8217;t stop &#123; &#x27;quoted&#x27;</p>`)).toEqual([])
  })

  it('still catches a real colour next to an HTML entity', () => {
    expect(unconvertedColours(`<p>Don&#8217;t</p><i style={{ color: '#333' }} />`)).toEqual(['#333'])
  })

  it('treats the allow-list as a multiset: one allowed occurrence per listed value', () => {
    const src = `a: '#25d366', b: '#25d366'`
    expect(unconvertedColours(src, ['#25d366'])).toEqual(['#25d366'])
    expect(unconvertedColours(src, ['#25d366', '#25d366'])).toEqual([])
  })
})
