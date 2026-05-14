import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { SendReviewButton } from '../components/SendReviewButton';
import { ContactActions } from '../components/ContactActions';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { CustomFieldsForm, CustomFieldsDisplay } from '../components/CustomFields';
import toast from 'react-hot-toast';
import {
  ArrowLeft, User, Mail, Star, Calendar,
  DollarSign, Hotel, MessageSquare, Edit3, Save, X, Tag, StickyNote
} from 'lucide-react';

type Tab = 'overview' | 'inquiries' | 'reservations' | 'activities';

export function GuestDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

  const { data: guest, isLoading, error } = useQuery({
    queryKey: ['guest', id],
    queryFn: () => api.get('/v1/admin/guests/' + id).then(r => r.data),
  });

  // Now that every guest is auto-linked to a loyalty member, MemberDetail is the
  // canonical person view. Redirect there whenever the link exists; this page
  // only stays reachable for the rare orphan that has no member yet.
  useEffect(() => {
    const g: any = (guest as any)?.data ?? guest;
    if (g?.member_id) {
      navigate(`/members/${g.member_id}`, { replace: true });
    }
  }, [guest, navigate]);

  // Seed the edit form whenever the guest loads or the user re-enters edit mode.
  useEffect(() => {
    if (guest && editing) {
      const g = (guest as any)?.data ?? guest;
      setForm({
        full_name: g.full_name ?? '',
        first_name: g.first_name ?? '',
        last_name: g.last_name ?? '',
        email: g.email ?? '',
        phone: g.phone ?? '',
        country: g.country ?? '',
        city: g.city ?? '',
        address: g.address ?? '',
        company: g.company ?? '',
        guest_type: g.guest_type ?? '',
        vip_level: g.vip_level ?? '',
        preferred_room_type: g.preferred_room_type ?? '',
        preferred_floor: g.preferred_floor ?? '',
        preferred_language: g.preferred_language ?? '',
        dietary_preferences: g.dietary_preferences ?? '',
        lead_source: g.lead_source ?? '',
        notes: g.notes ?? '',
        custom_data: g.custom_data ?? {},
      });
    }
  }, [guest, editing]);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => api.put('/v1/admin/guests/' + id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guest', id] });
      qc.invalidateQueries({ queryKey: ['guests'] });
      toast.success(t('guest_detail.toast_updated', 'Guest updated'));
      setEditing(false);
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || t('guest_detail.toast_save_failed', 'Failed to save guest'));
    },
  });

  const { data: inquiries } = useQuery({
    queryKey: ['guest-inquiries', id],
    queryFn: () => api.get('/v1/admin/guests/' + id + '/inquiries').then(r => r.data),
    enabled: activeTab === 'inquiries',
  });

  const { data: reservations } = useQuery({
    queryKey: ['guest-reservations', id],
    queryFn: () => api.get('/v1/admin/guests/' + id + '/reservations').then(r => r.data),
    enabled: activeTab === 'reservations',
  });

  const { data: activities } = useQuery({
    queryKey: ['guest-activities', id],
    queryFn: () => api.get('/v1/admin/guests/' + id + '/activities').then(r => r.data),
    enabled: activeTab === 'activities',
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  if (error || !guest) {
    return (
      <div className="p-6">
        <button onClick={() => navigate('/guests')} className="flex items-center gap-2 text-gray-400 hover:text-white mb-4">
          <ArrowLeft size={18} /> {t('guest_detail.back', 'Back to Guests')}
        </button>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center text-red-400">
          {t('guest_detail.not_found', 'Guest not found or failed to load.')}
        </div>
      </div>
    );
  }

  const g = guest?.data ?? guest;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: t('guest_detail.tabs.overview', 'Overview') },
    { key: 'inquiries', label: t('guest_detail.tabs.inquiries', 'Inquiries') },
    { key: 'reservations', label: t('guest_detail.tabs.reservations', 'Reservations') },
    { key: 'activities', label: t('guest_detail.tabs.activities', 'Activities') },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Back button */}
      <button onClick={() => navigate('/guests')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
        <ArrowLeft size={18} /> {t('guest_detail.back', 'Back to Guests')}
      </button>

      {/* Header */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
              <User size={28} className="text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {g.first_name} {g.last_name}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                {g.vip_level && (
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-medium">
                    {t('guest_detail.vip_prefix', { level: g.vip_level, defaultValue: 'VIP {{level}}' })}
                  </span>
                )}
                {g.loyalty_tier && (
                  <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs font-medium">
                    {g.loyalty_tier}
                  </span>
                )}
                {g.guest_type && (
                  <span className="text-gray-400 text-sm">{g.guest_type}</span>
                )}
              </div>
              <ContactActions email={g.email} phone={g.phone || g.mobile} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {g.id && <SendReviewButton target={{ guestId: g.id }} />}
            <button
              onClick={() => setEditing(!editing)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            >
              {editing ? <><X size={16} /> {t('guest_detail.cancel', 'Cancel')}</> : <><Edit3 size={16} /> {t('guest_detail.edit', 'Edit')}</>}
            </button>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Hotel size={20} />} label={t('guest_detail.stats.total_stays', 'Total Stays')} value={g.total_stays ?? 0} />
        <StatCard icon={<DollarSign size={20} />} label={t('guest_detail.stats.total_revenue', 'Total Revenue')} value={'$' + (g.total_revenue ?? 0).toLocaleString()} />
        <StatCard icon={<Calendar size={20} />} label={t('guest_detail.stats.last_stay', 'Last Stay')} value={g.last_stay_date ?? t('guest_detail.stats.na', 'N/A')} />
        <StatCard icon={<MessageSquare size={20} />} label={t('guest_detail.stats.inquiries', 'Inquiries')} value={g.inquiries_count ?? 0} />
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ' +
                (activeTab === tab.key
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-gray-400 hover:text-white')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && (
          <OverviewTab
            guest={g}
            editing={editing}
            form={form}
            setForm={setForm}
            saving={saveMutation.isPending}
            onSave={() => saveMutation.mutate(form)}
          />
        )}
        {activeTab === 'inquiries' && <InquiriesTab data={inquiries} />}
        {activeTab === 'reservations' && <ReservationsTab data={reservations} />}
        {activeTab === 'activities' && (
          <ActivityTimeline guestId={Number(id)} initialActivities={(activities as any)?.data ?? activities} />
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function OverviewTab({ guest, editing, form, setForm, saving, onSave }: {
  guest: any;
  editing: boolean;
  form: Record<string, any>;
  setForm: (f: Record<string, any>) => void;
  saving: boolean;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const g = guest;
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {editing && (
        <div className="md:col-span-2 bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <User size={16} /> {t('guest_detail.sections.identity', 'Identity')}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('guest_detail.fields.full_name', 'Full Name')}><input className={inp} value={form.full_name ?? ''} onChange={e => set('full_name', e.target.value)} /></Field>
            <Field label={t('guest_detail.fields.company', 'Company')}><input className={inp} value={form.company ?? ''} onChange={e => set('company', e.target.value)} /></Field>
            <Field label={t('guest_detail.fields.first_name', 'First Name')}><input className={inp} value={form.first_name ?? ''} onChange={e => set('first_name', e.target.value)} /></Field>
            <Field label={t('guest_detail.fields.last_name', 'Last Name')}><input className={inp} value={form.last_name ?? ''} onChange={e => set('last_name', e.target.value)} /></Field>
            <Field label={t('guest_detail.fields.guest_type', 'Guest Type')}><input className={inp} value={form.guest_type ?? ''} onChange={e => set('guest_type', e.target.value)} /></Field>
            <Field label={t('guest_detail.fields.vip_level', 'VIP Level')}><input className={inp} value={form.vip_level ?? ''} onChange={e => set('vip_level', e.target.value)} /></Field>
          </div>
        </div>
      )}

      {/* Contact Info */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Mail size={16} /> {t('guest_detail.sections.contact', 'Contact Information')}
        </h3>
        {editing ? (
          <div className="space-y-3">
            <Field label={t('guest_detail.fields.email', 'Email')}><input type="email" className={inp} value={form.email ?? ''} onChange={e => set('email', e.target.value)} /></Field>
            <Field label={t('guest_detail.fields.phone', 'Phone')}><input className={inp} value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} /></Field>
            <Field label={t('guest_detail.fields.country', 'Country')}><input className={inp} value={form.country ?? ''} onChange={e => set('country', e.target.value)} /></Field>
            <Field label={t('guest_detail.fields.city', 'City')}><input className={inp} value={form.city ?? ''} onChange={e => set('city', e.target.value)} /></Field>
            <Field label={t('guest_detail.fields.address', 'Address')}><textarea rows={2} className={inp} value={form.address ?? ''} onChange={e => set('address', e.target.value)} /></Field>
          </div>
        ) : (
          <div className="space-y-3">
            <InfoRow label={t('guest_detail.fields.email', 'Email')} value={g.email} />
            <InfoRow label={t('guest_detail.fields.phone', 'Phone')} value={g.phone} />
            <InfoRow label={t('guest_detail.fields.country', 'Country')} value={g.country} />
            <InfoRow label={t('guest_detail.fields.city', 'City')} value={g.city} />
            <InfoRow label={t('guest_detail.fields.address', 'Address')} value={g.address} />
          </div>
        )}
      </div>

      {/* Preferences */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Star size={16} /> {t('guest_detail.sections.preferences', 'Preferences')}
        </h3>
        {editing ? (
          <div className="space-y-3">
            <Field label={t('guest_detail.fields.room_type', 'Room Type')}><input className={inp} value={form.preferred_room_type ?? ''} onChange={e => set('preferred_room_type', e.target.value)} /></Field>
            <Field label={t('guest_detail.fields.floor', 'Floor')}><input className={inp} value={form.preferred_floor ?? ''} onChange={e => set('preferred_floor', e.target.value)} /></Field>
            <Field label={t('guest_detail.fields.language', 'Language')}><input className={inp} value={form.preferred_language ?? ''} onChange={e => set('preferred_language', e.target.value)} /></Field>
            <Field label={t('guest_detail.fields.dietary', 'Dietary')}><input className={inp} value={form.dietary_preferences ?? ''} onChange={e => set('dietary_preferences', e.target.value)} /></Field>
            <Field label={t('guest_detail.fields.source', 'Source')}><input className={inp} value={form.lead_source ?? ''} onChange={e => set('lead_source', e.target.value)} /></Field>
          </div>
        ) : (
          <div className="space-y-3">
            <InfoRow label={t('guest_detail.fields.room_type', 'Room Type')} value={g.preferred_room_type} />
            <InfoRow label={t('guest_detail.fields.floor', 'Floor')} value={g.preferred_floor} />
            <InfoRow label={t('guest_detail.fields.language', 'Language')} value={g.preferred_language} />
            <InfoRow label={t('guest_detail.fields.dietary', 'Dietary')} value={g.dietary_preferences} />
            <InfoRow label={t('guest_detail.fields.source', 'Source')} value={g.lead_source} />
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Tag size={16} /> {t('guest_detail.sections.tags', 'Tags')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {(g.tags && g.tags.length > 0) ? g.tags.map((tag: any, i: number) => (
            <span key={i} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-sm text-gray-300">
              {typeof tag === 'string' ? tag : (tag.name ?? '')}
            </span>
          )) : (
            <span className="text-gray-500 text-sm">{t('guest_detail.sections.no_tags', 'No tags')}</span>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <StickyNote size={16} /> {t('guest_detail.sections.notes', 'Notes')}
        </h3>
        {editing ? (
          <textarea rows={5} className={inp} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} />
        ) : (
          <p className="text-gray-300 text-sm whitespace-pre-wrap">
            {g.notes || t('guest_detail.sections.no_notes', 'No notes yet.')}
          </p>
        )}
      </div>

      {/* Custom fields — admin-defined per industry. Renders nothing
          if no custom fields are configured for guests. */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 md:col-span-2">
        {editing ? (
          <CustomFieldsForm
            entity="guest"
            values={form.custom_data ?? {}}
            onChange={(next) => set('custom_data', next)}
            inputClassName={inp}
          />
        ) : (
          <CustomFieldsDisplay entity="guest" values={g.custom_data} />
        )}
      </div>

      {editing && (
        <div className="md:col-span-2 flex justify-end">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Save size={16} /> {saving ? t('guest_detail.saving', 'Saving...') : t('guest_detail.save', 'Save Changes')}
          </button>
        </div>
      )}
    </div>
  );
}

const inp = 'w-full bg-[#0f0f1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-white text-sm">{value || '\u2014'}</span>
    </div>
  );
}

function InquiriesTab({ data }: { data: any }) {
  const { t } = useTranslation();
  const items = data?.data ?? data ?? [];

  if (!Array.isArray(items) || items.length === 0) {
    return <EmptyState text={t('guest_detail.inquiries_empty', 'No inquiries found.')} />;
  }

  return (
    <div className="space-y-3">
      {items.map((item: any, i: number) => {
        const statusText = item.status === 'resolved' ? t('guest_detail.inquiry_status.resolved', 'resolved')
          : item.status === 'pending' ? t('guest_detail.inquiry_status.pending', 'pending')
          : (item.status || t('guest_detail.inquiry_status.open', 'open'));
        return (
        <div key={i} className="bg-[#1a1a2e] border border-white/10 rounded-xl p-4">
          <div className="flex justify-between items-start mb-2">
            <h4 className="text-white font-medium">{item.subject || t('guest_detail.inquiry_default', { n: i + 1, defaultValue: 'Inquiry #{{n}}' })}</h4>
            <span className={'px-2 py-0.5 rounded text-xs ' +
              (item.status === 'resolved' ? 'bg-green-500/20 text-green-400' :
               item.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
               'bg-gray-500/20 text-gray-400')}>
              {statusText}
            </span>
          </div>
          <p className="text-gray-400 text-sm">{item.message || item.description || ''}</p>
          {item.created_at && <p className="text-gray-500 text-xs mt-2">{item.created_at}</p>}
        </div>
        );
      })}
    </div>
  );
}

function ReservationsTab({ data }: { data: any }) {
  const { t } = useTranslation();
  const items = data?.data ?? data ?? [];

  if (!Array.isArray(items) || items.length === 0) {
    return <EmptyState text={t('guest_detail.reservations_empty', 'No reservations found.')} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-gray-400 text-xs border-b border-white/10">
            <th className="pb-3 font-medium">{t('guest_detail.reservations_table.confirmation', 'Confirmation')}</th>
            <th className="pb-3 font-medium">{t('guest_detail.reservations_table.check_in', 'Check-in')}</th>
            <th className="pb-3 font-medium">{t('guest_detail.reservations_table.check_out', 'Check-out')}</th>
            <th className="pb-3 font-medium">{t('guest_detail.reservations_table.room', 'Room')}</th>
            <th className="pb-3 font-medium">{t('guest_detail.reservations_table.status', 'Status')}</th>
            <th className="pb-3 font-medium text-right">{t('guest_detail.reservations_table.amount', 'Amount')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r: any, i: number) => {
            const statusText = r.status === 'confirmed' ? t('guest_detail.reservations_table.status_confirmed', 'confirmed')
              : r.status === 'cancelled' ? t('guest_detail.reservations_table.status_cancelled', 'cancelled')
              : (r.status || t('guest_detail.reservations_table.status_unknown', 'unknown'));
            return (
            <tr key={i} className="border-b border-white/5 text-sm">
              <td className="py-3 text-white">{r.confirmation_number || '\u2014'}</td>
              <td className="py-3 text-gray-300">{r.check_in || r.check_in_date || '\u2014'}</td>
              <td className="py-3 text-gray-300">{r.check_out || r.check_out_date || '\u2014'}</td>
              <td className="py-3 text-gray-300">{r.room_type || r.room || '\u2014'}</td>
              <td className="py-3">
                <span className={'px-2 py-0.5 rounded text-xs ' +
                  (r.status === 'confirmed' ? 'bg-green-500/20 text-green-400' :
                   r.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                   'bg-gray-500/20 text-gray-400')}>
                  {statusText}
                </span>
              </td>
              <td className="py-3 text-right text-white">${(r.total_amount ?? r.amount ?? 0).toLocaleString()}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-12 text-center text-gray-500">
      {text}
    </div>
  );
}
