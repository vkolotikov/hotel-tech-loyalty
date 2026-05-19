import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, GitBranch, Users, Building2, Crown, ListChecks,
  Save, Search, Eye, EyeOff, RotateCcw, type LucideIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import {
  useSettings,
  DEFAULT_INQUIRY_FIELDS, DEFAULT_CUSTOMER_FIELDS,
  DEFAULT_CORPORATE_FIELDS, DEFAULT_DEAL_FIELDS, DEFAULT_MEMBER_FIELDS,
  DEFAULT_TASK_FIELDS,
} from '../lib/crmSettings'

/**
 * Unified field-visibility manager. Replaces the old "two columns of
 * toggles" panel that only covered Inquiries — this one covers
 * Inquiries (Leads), Deals, Customers, and Companies in tabs and uses
 * the same data shape pattern so adding a new entity is one config
 * block, not a new component.
 *
 * Each tab edits one `crm_settings` row keyed by `<entity>_fields`.
 * Drafts live locally so toggles feel immediate; we save on user
 * click rather than per-toggle to keep API traffic predictable.
 *
 * Required fields (e.g. customer name, deal/customer column, status)
 * live outside this config — they're hardcoded as always-shown so
 * the UI stays usable when an admin turns everything off.
 */

type TabKey = 'inquiry' | 'deal' | 'customer' | 'corporate' | 'member' | 'task'

type Section = {
  /** UI label for the section ("List columns", "Add Inquiry form"). */
  label: string
  /** Path inside the entity config object: e.g. ['list'] or ['form']. */
  path: string
  /** Field keys + labels + optional hint shown under the label. */
  fields: Array<{ key: string; label: string; hint?: string }>
}

type TabDef = {
  key: TabKey
  label: string
  icon: LucideIcon
  /** crm_settings key — also the cache invalidation tag. */
  settingsKey: string
  /** Server defaults used as a "Reset to defaults" baseline. */
  defaults: Record<string, any>
  /** Path through the settings object to get the current config. */
  configKey: 'inquiry_fields' | 'customer_fields' | 'corporate_fields' | 'deal_fields' | 'member_fields' | 'task_fields'
  sections: Section[]
}

const TABS: TabDef[] = [
  {
    key: 'inquiry',
    label: 'Leads',
    icon: Sparkles,
    settingsKey: 'inquiry_fields',
    defaults: DEFAULT_INQUIRY_FIELDS,
    configKey: 'inquiry_fields',
    sections: [
      {
        label: 'Add Inquiry form',
        path: 'form',
        fields: [
          { key: 'check_in', label: 'Check-in' },
          { key: 'check_out', label: 'Check-out' },
          { key: 'num_rooms', label: 'Rooms' },
          { key: 'inquiry_type', label: 'Inquiry type' },
          { key: 'source', label: 'Source' },
          { key: 'room_type', label: 'Room type' },
          { key: 'rate_offered', label: 'Rate' },
          { key: 'total_value', label: 'Total value' },
          { key: 'status', label: 'Status' },
          { key: 'priority', label: 'Priority' },
          { key: 'assigned_to', label: 'Assigned to' },
          { key: 'special_requests', label: 'Special requests' },
          { key: 'notes', label: 'Notes' },
        ],
      },
      {
        label: 'Leads list columns',
        path: 'list',
        fields: [
          { key: 'bulk_select', label: 'Bulk-select column (always visible)', hint: 'When OFF (default), the bulk-select checkboxes fade in on row hover. When ON, the checkbox column stays visible at rest — useful if your team uses bulk owner reassign / status changes daily.' },
          { key: 'stay', label: 'Stay (dates · nights · rooms)' },
          { key: 'value', label: 'Value (€)' },
          { key: 'owner', label: 'Owner' },
          { key: 'touches', label: 'Touches' },
          { key: 'next_task', label: 'Next task' },
          { key: 'country', label: 'Country chip', hint: 'Shows the guest country in the metadata cluster under the name. Off by default — handy for international hotels / clinics that triage by region.' },
        ],
      },
      {
        label: 'Inquiry detail page',
        path: 'detail',
        fields: [
          { key: 'contact_section', label: 'Contact (email + phone)' },
          { key: 'stay_section', label: 'Stay block', hint: 'Check-in / check-out / rooms / adults / children. Hide for service-only orgs.' },
          { key: 'special_requests', label: 'Special requests' },
          { key: 'pipeline_section', label: 'Pipeline block', hint: 'Property / priority / source.' },
          { key: 'linked_reservation', label: 'Linked reservation' },
          { key: 'custom_fields_section', label: 'Custom fields' },
          { key: 'guest_profile_link', label: 'Open guest profile link' },
          { key: 'ai_smart_panel', label: 'AI Smart Panel', hint: 'AI brief + intent + win probability + suggested action.' },
          { key: 'open_tasks', label: 'Open tasks panel' },
          { key: 'attachments', label: 'Attachments panel' },
        ],
      },
    ],
  },
  {
    key: 'deal',
    label: 'Deals',
    icon: GitBranch,
    settingsKey: 'deal_fields',
    defaults: DEFAULT_DEAL_FIELDS,
    configKey: 'deal_fields',
    sections: [
      {
        label: 'Deals list columns',
        path: 'list',
        fields: [
          { key: 'product_details', label: 'Product & details', hint: 'Room type or service, rooms / pax count.' },
          { key: 'amount', label: 'Amount' },
          { key: 'payment', label: 'Payment status' },
          { key: 'fulfillment', label: 'Fulfillment stage' },
          { key: 'next_action', label: 'Next action' },
          { key: 'due_date', label: 'Due date' },
          { key: 'owner', label: 'Owner' },
        ],
      },
    ],
  },
  {
    key: 'customer',
    label: 'Customers',
    icon: Users,
    settingsKey: 'customer_fields',
    defaults: DEFAULT_CUSTOMER_FIELDS,
    configKey: 'customer_fields',
    sections: [
      {
        label: 'Customers list columns',
        path: 'list',
        fields: [
          { key: 'contact', label: 'Contact (email + phone)' },
          { key: 'company', label: 'Company' },
          { key: 'activity', label: 'Activity (stays / added date)' },
          { key: 'vip_badge', label: 'VIP badge', hint: 'Star pill next to the name for VIPs. Auto-hides if the customer is Standard tier.' },
          { key: 'position_title', label: 'Position / job title' },
          { key: 'country', label: 'Country chip', hint: 'Small country tag next to the name. Off by default — useful for international hotels / clinics.' },
        ],
      },
      {
        label: 'Customer detail page',
        path: 'detail',
        fields: [
          { key: 'header_pills', label: 'Header pills', hint: 'Lifecycle, VIP and lead-source chips above the stats.' },
          { key: 'stats_strip', label: 'Stats strip', hint: 'Total stays / nights / revenue / last stay.' },
          { key: 'profile_b2b', label: 'B2B profile fields', hint: 'Company, guest type, owner, importance.' },
          { key: 'profile_location', label: 'Location + address' },
          { key: 'profile_hotel_prefs', label: 'Hotel preferences', hint: 'Preferred room / floor / language / dietary. Hide for service-only orgs.' },
          { key: 'profile_dates', label: 'Activity dates', hint: 'Last activity + first stay.' },
          { key: 'tags', label: 'Tags' },
          { key: 'notes', label: 'Notes' },
          { key: 'activity_log', label: 'Activity log' },
          { key: 'recent_reservations', label: 'Recent reservations' },
          { key: 'recent_inquiries', label: 'Recent inquiries' },
        ],
      },
    ],
  },
  {
    key: 'corporate',
    label: 'Companies',
    icon: Building2,
    settingsKey: 'corporate_fields',
    defaults: DEFAULT_CORPORATE_FIELDS,
    configKey: 'corporate_fields',
    sections: [
      {
        label: 'Companies list columns',
        path: 'list',
        fields: [
          { key: 'industry', label: 'Industry' },
          { key: 'contact_person', label: 'Contact person' },
          { key: 'account_manager', label: 'Account manager' },
          { key: 'contract', label: 'Contract dates' },
          { key: 'rate', label: 'Negotiated rate' },
          { key: 'discount', label: 'Discount %' },
          { key: 'revenue', label: 'Annual revenue' },
          { key: 'status', label: 'Status' },
        ],
      },
      {
        label: 'Company detail page',
        path: 'detail',
        fields: [
          { key: 'vitals_strip', label: 'Vitals strip', hint: 'Lifetime revenue, open pipeline, credit meter, last contact.' },
          { key: 'renewal_chip', label: 'Renewal-soon banner', hint: 'Amber chip when contract ends within 60 days.' },
          { key: 'info_billing', label: 'Billing fields', hint: 'Billing email / tax ID / rate type / payment terms.' },
          { key: 'info_address', label: 'Billing address' },
          { key: 'info_notes', label: 'Notes' },
          { key: 'custom_fields', label: 'Custom fields panel' },
          { key: 'linked_deals', label: 'Linked deals' },
          { key: 'recent_reservations', label: 'Recent reservations' },
        ],
      },
    ],
  },
  {
    key: 'member',
    label: 'Members',
    icon: Crown,
    settingsKey: 'member_fields',
    defaults: DEFAULT_MEMBER_FIELDS,
    configKey: 'member_fields',
    sections: [
      {
        label: 'Members page',
        path: 'list',
        fields: [
          { key: 'kpi_strip', label: 'KPI strip', hint: '4 cards above the table: active / new this month / avg points / top tier %.' },
          { key: 'phone', label: 'Phone column' },
          { key: 'source', label: 'Source column', hint: 'Lead-source pill from the linked guest.' },
          { key: 'tier', label: 'Tier column' },
          { key: 'points', label: 'Points column' },
          { key: 'joined', label: 'Joined-date column' },
          { key: 'status', label: 'Status column', hint: 'Active / Inactive pill.' },
        ],
      },
      {
        label: 'Member detail page',
        path: 'detail',
        fields: [
          { key: 'hero_stats', label: 'Hero stats row', hint: 'Stays / Total spent / Member since. Current points always stays.' },
          { key: 'ai_analysis_button', label: 'AI Analysis button', hint: 'Triggers churn-risk + upsell suggestions. Hide if you don\'t use AI features.' },
          { key: 'tab_transactions', label: 'Transactions tab' },
          { key: 'tab_journey', label: 'Journey tab', hint: 'Customer journey timeline. Still requires a linked CRM guest.' },
          { key: 'tab_settings', label: 'Settings tab' },
          { key: 'overview_recent_activity', label: 'Recent activity card', hint: 'Top-5 transactions block on the Overview tab.' },
          { key: 'overview_qr_card', label: 'Member QR card', hint: 'Right-column QR for scanning.' },
          { key: 'overview_adjust_points', label: 'Award / Redeem panel' },
        ],
      },
    ],
  },
  {
    key: 'task',
    label: 'Tasks',
    icon: ListChecks,
    settingsKey: 'task_fields',
    defaults: DEFAULT_TASK_FIELDS,
    configKey: 'task_fields',
    sections: [
      {
        label: 'Task card',
        path: 'list',
        fields: [
          { key: 'description', label: 'Description', hint: 'Multi-line text under the task title.' },
          { key: 'type_label', label: 'Type label', hint: 'Uppercase "CALL" / "EMAIL" / etc. chip. The colored icon stays regardless.' },
          { key: 'due_at', label: 'Due date' },
          { key: 'assignee', label: 'Assignee' },
          { key: 'inquiry_link', label: 'Inquiry link', hint: '"Inquiry #123" chip that opens the related lead.' },
          { key: 'outcome', label: 'Outcome', hint: 'Completion note shown on done tasks.' },
        ],
      },
    ],
  },
]

export function FieldManagerPanel() {
  const [activeTab, setActiveTab] = useState<TabKey>('inquiry')
  const settings = useSettings()

  const tabDef = TABS.find(t => t.key === activeTab)!

  return (
    <div>
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Eye size={16} className="text-cyan-400" /> Fields
          </h2>
          <p className="text-xs text-t-secondary mt-1">
            Pick which fields appear on add forms and which columns show up in each list.
            Identity columns (name, status, actions) are always shown.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-3 border-b border-dark-border overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          const cfg = (settings as any)[t.configKey]
          const counts = countActive(cfg, t.sections)
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={
                'flex items-center gap-2 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition '
                + (active
                  ? 'border-accent text-white'
                  : 'border-transparent text-t-secondary hover:text-white')
              }
            >
              <Icon size={14} className={active ? 'text-accent' : ''} />
              {t.label}
              <span className={'text-[10px] font-mono px-1.5 py-0.5 rounded ' + (active ? 'bg-accent/15 text-accent' : 'bg-dark-surface text-t-secondary')}>
                {counts.on}/{counts.total}
              </span>
            </button>
          )
        })}
      </div>

      <TabEditor key={tabDef.key} tab={tabDef} initial={(settings as any)[tabDef.configKey]} />
    </div>
  )
}

function TabEditor({ tab, initial }: { tab: TabDef; initial: any }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<any>(initial)
  const [dirty, setDirty] = useState(false)
  const [query, setQuery] = useState('')

  // Re-sync when the upstream settings change (e.g. after our own save).
  useEffect(() => { setDraft(initial); setDirty(false) }, [initial])

  const save = useMutation({
    mutationFn: () => api.put(`/v1/admin/crm-settings/${tab.settingsKey}`, { value: draft }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-settings'] })
      toast.success(`${tab.label} fields saved`)
      setDirty(false)
    },
    onError: () => toast.error('Save failed'),
  })

  const reset = () => {
    setDraft(tab.defaults)
    setDirty(true)
  }

  const toggle = (sectionPath: string, key: string) => {
    setDraft((d: any) => ({
      ...d,
      [sectionPath]: { ...(d?.[sectionPath] ?? {}), [key]: !d?.[sectionPath]?.[key] },
    }))
    setDirty(true)
  }

  const bulkSet = (sectionPath: string, on: boolean) => {
    setDraft((d: any) => {
      const next = { ...(d?.[sectionPath] ?? {}) }
      const section = tab.sections.find(s => s.path === sectionPath)
      section?.fields.forEach(f => { next[f.key] = on })
      return { ...d, [sectionPath]: next }
    })
    setDirty(true)
  }

  const lowerQuery = query.trim().toLowerCase()
  const filteredSections = useMemo(() => {
    if (!lowerQuery) return tab.sections
    return tab.sections
      .map(s => ({
        ...s,
        fields: s.fields.filter(f =>
          f.label.toLowerCase().includes(lowerQuery)
          || (f.hint ?? '').toLowerCase().includes(lowerQuery)),
      }))
      .filter(s => s.fields.length > 0)
  }, [lowerQuery, tab.sections])

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-t-secondary" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${tab.label.toLowerCase()} fields…`}
            className="w-full bg-dark-bg border border-dark-border rounded-md pl-7 pr-2 py-1.5 text-xs text-white placeholder:text-t-secondary outline-none focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="text-xs text-t-secondary hover:text-white px-2 py-1 rounded hover:bg-dark-surface2 flex items-center gap-1"
            title="Reset to defaults"
          >
            <RotateCcw size={11} /> Reset
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            className="flex items-center gap-1.5 bg-accent text-black font-bold rounded-md px-3 py-1.5 text-xs disabled:opacity-50 hover:bg-accent/90"
          >
            <Save size={12} />
            {save.isPending ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredSections.length === 0 && (
          <div className="md:col-span-2 text-center text-xs text-t-secondary py-8">
            No fields match "{query}".
          </div>
        )}
        {filteredSections.map(section => {
          const sectionConfig = (draft?.[section.path] ?? {}) as Record<string, boolean>
          const on = section.fields.filter(f => sectionConfig[f.key]).length
          return (
            <div key={section.path} className="bg-dark-bg border border-dark-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-t-secondary">
                  {section.label}
                </h3>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-t-secondary font-mono">{on}/{section.fields.length}</span>
                  <button
                    onClick={() => bulkSet(section.path, true)}
                    className="text-[10px] text-t-secondary hover:text-emerald-400 px-1.5 py-0.5 rounded hover:bg-dark-surface2"
                  >All on</button>
                  <button
                    onClick={() => bulkSet(section.path, false)}
                    className="text-[10px] text-t-secondary hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-dark-surface2"
                  >All off</button>
                </div>
              </div>
              <div className="space-y-0.5">
                {section.fields.map(f => (
                  <FieldRow
                    key={f.key}
                    label={f.label}
                    hint={f.hint}
                    on={!!sectionConfig[f.key]}
                    onToggle={() => toggle(section.path, f.key)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FieldRow({ label, hint, on, onToggle }: {
  label: string
  hint?: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-dark-surface2/50 transition text-left"
    >
      <div className="flex items-center gap-2 min-w-0">
        {on
          ? <Eye size={13} className="text-emerald-400 flex-shrink-0" />
          : <EyeOff size={13} className="text-t-secondary flex-shrink-0" />}
        <div className="min-w-0">
          <div className={'text-xs ' + (on ? 'text-white' : 'text-t-secondary')}>{label}</div>
          {hint && <div className="text-[10px] text-t-secondary/70 truncate">{hint}</div>}
        </div>
      </div>
      <div className={'w-8 h-4 rounded-full relative transition ' + (on ? 'bg-accent' : 'bg-dark-surface2')}>
        <div className={'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ' + (on ? 'left-[18px]' : 'left-0.5')} />
      </div>
    </button>
  )
}

function countActive(cfg: any, sections: Section[]): { on: number; total: number } {
  let on = 0
  let total = 0
  for (const s of sections) {
    const sec = cfg?.[s.path] ?? {}
    for (const f of s.fields) {
      total++
      if (sec[f.key]) on++
    }
  }
  return { on, total }
}
