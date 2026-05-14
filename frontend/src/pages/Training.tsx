import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { GraduationCap, Play, Download, X as XCircle, RefreshCw, Database, FileText, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const BASE_MODELS = [
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini (recommended)' },
  { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano (fastest)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini (newest)' },
  { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
]

export function Training() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [baseModel, setBaseModel] = useState('gpt-4.1-mini')
  const [epochs, setEpochs] = useState(3)

  // Training stats
  const { data: stats } = useQuery({
    queryKey: ['training-stats'],
    queryFn: () => api.get('/v1/admin/training/stats').then(r => r.data),
  })

  // Training jobs
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['training-jobs'],
    queryFn: () => api.get('/v1/admin/training/jobs').then(r => r.data),
  })

  // Export training data
  const exportData = useMutation({
    mutationFn: () => api.post('/v1/admin/training/export-data').then(r => r.data),
    onSuccess: (data) => {
      // Download as file
      const blob = new Blob([data.jsonl], { type: 'application/jsonl' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `training-data-${format(new Date(), 'yyyy-MM-dd')}.jsonl`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('training.toasts.exported', { count: data.count, defaultValue: 'Exported {{count}} training examples' }))
    },
    onError: () => toast.error(t('training.toasts.export_failed', 'Export failed')),
  })

  // Create training job
  const createJob = useMutation({
    mutationFn: (data: any) => api.post('/v1/admin/training/jobs', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training-jobs'] })
      qc.invalidateQueries({ queryKey: ['training-stats'] })
      setShowCreate(false)
      toast.success(t('training.toasts.job_created', 'Training job created'))
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('training.toasts.create_failed', 'Failed to create job')),
  })

  // Cancel job
  const cancelJob = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/training/jobs/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training-jobs'] })
      toast.success(t('training.toasts.job_cancelled', 'Job cancelled'))
    },
  })

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      preparing: 'bg-yellow-500/20 text-yellow-400',
      uploading: 'bg-blue-500/20 text-blue-400',
      training: 'bg-purple-500/20 text-purple-400 animate-pulse',
      completed: 'bg-green-500/20 text-green-400',
      failed: 'bg-red-500/20 text-red-400',
      cancelled: 'bg-dark-surface4 text-t-secondary',
    }
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.preparing}`}>{t(`training.statuses.${status}`, { defaultValue: String(status ?? '') })}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <GraduationCap className="text-primary-500" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-white">{t('training.title', 'AI Training & Fine-tuning')}</h1>
          <p className="text-sm text-t-secondary">{t('training.subtitle', 'Train custom AI models using your knowledge base data')}</p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-t-secondary text-xs mb-1"><Database size={14} /> {t('training.stats.faq_items', 'Active FAQ Items')}</div>
            <div className="text-2xl font-bold text-white">{stats.faq_count}</div>
          </div>
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-t-secondary text-xs mb-1"><FileText size={14} /> {t('training.stats.documents', 'Processed Documents')}</div>
            <div className="text-2xl font-bold text-white">{stats.document_count}</div>
          </div>
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-t-secondary text-xs mb-1"><GraduationCap size={14} /> {t('training.stats.jobs', 'Training Jobs')}</div>
            <div className="text-2xl font-bold text-white">{stats.jobs_count}</div>
          </div>
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-t-secondary text-xs mb-1"><RefreshCw size={14} /> {t('training.stats.active_jobs', 'Active Jobs')}</div>
            <div className="text-2xl font-bold text-primary-400">{stats.active_jobs}</div>
          </div>
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex items-center gap-3">
        <button onClick={() => exportData.mutate()} disabled={exportData.isPending}
          className="flex items-center gap-2 bg-dark-surface border border-dark-border text-white px-4 py-2 rounded-lg hover:bg-dark-surface3 text-sm disabled:opacity-50">
          <Download size={16} /> {exportData.isPending ? t('training.exporting', 'Exporting...') : t('training.export', 'Export Training Data (JSONL)')}
        </button>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm">
          <Play size={16} /> {t('training.new_job', 'New Training Job')}
        </button>
      </div>

      {/* Create Job Form */}
      {showCreate && (
        <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">{t('training.create_form.title', 'Create Fine-tuning Job')}</h3>
            <button onClick={() => setShowCreate(false)} className="text-t-secondary hover:text-white"><XCircle size={18} /></button>
          </div>

          {(stats?.faq_count || 0) < 10 && (
            <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3">
              <AlertTriangle size={16} className="text-yellow-400" />
              <span className="text-sm text-yellow-400">{t('training.create_form.warn_min_faqs', { count: stats?.faq_count || 0, defaultValue: 'You need at least 10 active FAQ items to start fine-tuning. Currently: {{count}}' })}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-t-secondary mb-1">{t('training.create_form.base_model', 'Base Model')}</label>
              <select value={baseModel} onChange={e => setBaseModel(e.target.value)}
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm">
                {BASE_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-t-secondary mb-1">{t('training.create_form.epochs', 'Epochs')}</label>
              <input type="number" min={1} max={50} value={epochs} onChange={e => setEpochs(Number(e.target.value))}
                className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
              <p className="text-xs text-dark-border2 mt-1">{t('training.create_form.epochs_hint', 'How many times to iterate over the training data (3 is typical)')}</p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-t-secondary hover:text-white">{t('training.create_form.cancel', 'Cancel')}</button>
            <button
              onClick={() => createJob.mutate({ base_model: baseModel, hyperparameters: { n_epochs: epochs } })}
              disabled={createJob.isPending || (stats?.faq_count || 0) < 10}
              className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50">
              <Play size={14} /> {createJob.isPending ? t('training.create_form.creating', 'Creating...') : t('training.create_form.start', 'Start Training')}
            </button>
          </div>
        </div>
      )}

      {/* Jobs List */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">{t('training.jobs_section', 'Training Jobs')}</h2>
        {isLoading ? (
          <div className="text-center text-t-secondary py-12">{t('training.loading', 'Loading...')}</div>
        ) : jobs.length === 0 ? (
          <div className="text-center text-t-secondary py-12">
            <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
            <p>{t('training.empty', 'No training jobs yet. Export your data or start a fine-tuning job.')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job: any) => (
              <div key={job.id} className="bg-dark-surface border border-dark-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium">{t('training.job.id_prefix', { id: job.id, defaultValue: 'Job #{{id}}' })}</span>
                      {statusBadge(job.status)}
                      <span className="text-xs text-t-secondary">{job.base_model}</span>
                    </div>
                    <div className="text-xs text-dark-border2 space-x-3">
                      {job.started_at && <span>{t('training.job.started', { date: format(new Date(job.started_at), 'MMM d, HH:mm'), defaultValue: 'Started: {{date}}' })}</span>}
                      {job.completed_at && <span>{t('training.job.completed', { date: format(new Date(job.completed_at), 'MMM d, HH:mm'), defaultValue: 'Completed: {{date}}' })}</span>}
                      {job.fine_tuned_model && <span className="text-green-400">{t('training.job.model', { name: job.fine_tuned_model, defaultValue: 'Model: {{name}}' })}</span>}
                      {job.hyperparameters?.n_epochs && <span>{t('training.job.epochs', { count: job.hyperparameters.n_epochs, defaultValue: 'Epochs: {{count}}' })}</span>}
                    </div>
                    {job.error_message && (
                      <p className="text-xs text-red-400 mt-1">{job.error_message}</p>
                    )}
                    {job.result_metrics && Object.keys(job.result_metrics).length > 0 && (
                      <div className="flex gap-3 mt-1">
                        {Object.entries(job.result_metrics).map(([k, v]: [string, any]) => (
                          <span key={k} className="text-xs text-t-secondary">{k}: <span className="text-white">{typeof v === 'number' ? v.toFixed(4) : v}</span></span>
                        ))}
                      </div>
                    )}
                  </div>
                  {['preparing', 'uploading', 'training'].includes(job.status) && (
                    <button onClick={() => cancelJob.mutate(job.id)} disabled={cancelJob.isPending}
                      className="flex items-center gap-1 text-xs bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/30">
                      <XCircle size={12} /> {t('training.job.cancel', 'Cancel')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
