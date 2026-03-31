import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  ArrowLeft, User, Mail, Star, Calendar,
  DollarSign, Hotel, MessageSquare, Edit3, Save, X, Tag, StickyNote
} from 'lucide-react';

type Tab = 'overview' | 'inquiries' | 'reservations' | 'activities';

export function GuestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);

  const { data: guest, isLoading, error } = useQuery({
    queryKey: ['guest', id],
    queryFn: () => api.get('/v1/admin/guests/' + id).then(r => r.data),
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
          <ArrowLeft size={18} /> Back to Guests
        </button>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center text-red-400">
          Guest not found or failed to load.
        </div>
      </div>
    );
  }

  const g = guest?.data ?? guest;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'inquiries', label: 'Inquiries' },
    { key: 'reservations', label: 'Reservations' },
    { key: 'activities', label: 'Activities' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Back button */}
      <button onClick={() => navigate('/guests')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
        <ArrowLeft size={18} /> Back to Guests
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
                    VIP {g.vip_level}
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
            </div>
          </div>
          <button
            onClick={() => setEditing(!editing)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
          >
            {editing ? <><X size={16} /> Cancel</> : <><Edit3 size={16} /> Edit</>}
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Hotel size={20} />} label="Total Stays" value={g.total_stays ?? 0} />
        <StatCard icon={<DollarSign size={20} />} label="Total Revenue" value={'$' + (g.total_revenue ?? 0).toLocaleString()} />
        <StatCard icon={<Calendar size={20} />} label="Last Stay" value={g.last_stay_date ?? 'N/A'} />
        <StatCard icon={<MessageSquare size={20} />} label="Inquiries" value={g.inquiries_count ?? 0} />
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ' +
                (activeTab === t.key
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-gray-400 hover:text-white')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && <OverviewTab guest={g} editing={editing} onSave={() => setEditing(false)} />}
        {activeTab === 'inquiries' && <InquiriesTab data={inquiries} />}
        {activeTab === 'reservations' && <ReservationsTab data={reservations} />}
        {activeTab === 'activities' && <ActivitiesTab data={activities} />}
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

function OverviewTab({ guest, editing, onSave }: { guest: any; editing: boolean; onSave: () => void }) {
  const g = guest;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Contact Info */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Mail size={16} /> Contact Information
        </h3>
        <div className="space-y-3">
          <InfoRow label="Email" value={g.email} />
          <InfoRow label="Phone" value={g.phone} />
          <InfoRow label="Country" value={g.country} />
          <InfoRow label="City" value={g.city} />
          <InfoRow label="Address" value={g.address} />
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Star size={16} /> Preferences
        </h3>
        <div className="space-y-3">
          <InfoRow label="Room Type" value={g.preferred_room_type} />
          <InfoRow label="Floor" value={g.preferred_floor} />
          <InfoRow label="Bed Type" value={g.preferred_bed_type} />
          <InfoRow label="Dietary" value={g.dietary_requirements} />
          <InfoRow label="Language" value={g.language} />
          <InfoRow label="Source" value={g.source} />
        </div>
      </div>

      {/* Tags */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Tag size={16} /> Tags
        </h3>
        <div className="flex flex-wrap gap-2">
          {(g.tags && g.tags.length > 0) ? g.tags.map((tag: string, i: number) => (
            <span key={i} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-sm text-gray-300">
              {tag}
            </span>
          )) : (
            <span className="text-gray-500 text-sm">No tags</span>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <StickyNote size={16} /> Notes
        </h3>
        <p className="text-gray-300 text-sm whitespace-pre-wrap">
          {g.notes || 'No notes yet.'}
        </p>
      </div>

      {editing && (
        <div className="md:col-span-2 flex justify-end">
          <button
            onClick={onSave}
            className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg transition-colors"
          >
            <Save size={16} /> Save Changes
          </button>
        </div>
      )}
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
  const items = data?.data ?? data ?? [];

  if (!Array.isArray(items) || items.length === 0) {
    return <EmptyState text="No inquiries found." />;
  }

  return (
    <div className="space-y-3">
      {items.map((item: any, i: number) => (
        <div key={i} className="bg-[#1a1a2e] border border-white/10 rounded-xl p-4">
          <div className="flex justify-between items-start mb-2">
            <h4 className="text-white font-medium">{item.subject || 'Inquiry #' + (i + 1)}</h4>
            <span className={'px-2 py-0.5 rounded text-xs ' +
              (item.status === 'resolved' ? 'bg-green-500/20 text-green-400' :
               item.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
               'bg-gray-500/20 text-gray-400')}>
              {item.status || 'open'}
            </span>
          </div>
          <p className="text-gray-400 text-sm">{item.message || item.description || ''}</p>
          {item.created_at && <p className="text-gray-500 text-xs mt-2">{item.created_at}</p>}
        </div>
      ))}
    </div>
  );
}

function ReservationsTab({ data }: { data: any }) {
  const items = data?.data ?? data ?? [];

  if (!Array.isArray(items) || items.length === 0) {
    return <EmptyState text="No reservations found." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-gray-400 text-xs border-b border-white/10">
            <th className="pb-3 font-medium">Confirmation</th>
            <th className="pb-3 font-medium">Check-in</th>
            <th className="pb-3 font-medium">Check-out</th>
            <th className="pb-3 font-medium">Room</th>
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3 font-medium text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r: any, i: number) => (
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
                  {r.status || 'unknown'}
                </span>
              </td>
              <td className="py-3 text-right text-white">${(r.total_amount ?? r.amount ?? 0).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivitiesTab({ data }: { data: any }) {
  const items = data?.data ?? data ?? [];

  if (!Array.isArray(items) || items.length === 0) {
    return <EmptyState text="No activities recorded." />;
  }

  return (
    <div className="space-y-3">
      {items.map((a: any, i: number) => (
        <div key={i} className="flex gap-4 bg-[#1a1a2e] border border-white/10 rounded-xl p-4">
          <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0" />
          <div>
            <p className="text-white text-sm">{a.description || a.action || a.type || 'Activity'}</p>
            {a.created_at && <p className="text-gray-500 text-xs mt-1">{a.created_at}</p>}
          </div>
        </div>
      ))}
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
