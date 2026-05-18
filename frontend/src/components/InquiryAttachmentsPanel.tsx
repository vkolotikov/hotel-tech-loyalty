import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Paperclip, Upload, FileText, FileImage, FileArchive, FileSpreadsheet,
  Trash2, Loader2, Download,
} from 'lucide-react'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

/**
 * File attachments panel for a single inquiry. Mounted in the right column
 * of /inquiries/:id alongside tasks and the AI smart panel.
 *
 * Supports proposals, contracts, BEOs, scanned IDs, invoices — anything
 * the deal accumulates over its lifetime. 25 MB / file cap matches the
 * backend validation.
 */

type Attachment = {
  id: number
  filename: string
  url: string
  mime_type: string | null
  size_bytes: number | null
  note: string | null
  uploader: { id: number; name: string } | null
  created_at: string | null
}

const ALLOWED_HINT = 'PDF, DOC, XLS, PPT, images, ZIP — up to 25 MB'

function iconFor(mime: string | null) {
  if (!mime) return FileText
  if (mime.startsWith('image/')) return FileImage
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv') return FileSpreadsheet
  if (mime.includes('zip')) return FileArchive
  return FileText
}

function formatBytes(b: number | null) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function InquiryAttachmentsPanel({ inquiryId }: { inquiryId: number }) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const { data, isLoading } = useQuery<{ data: Attachment[] }>({
    queryKey: ['inquiry-attachments', inquiryId],
    queryFn: () => api.get(`/v1/admin/inquiries/${inquiryId}/attachments`).then(r => r.data),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      // Don't set Content-Type manually — Axios picks the right multipart boundary.
      return api.post(`/v1/admin/inquiries/${inquiryId}/attachments`, form).then(r => r.data)
    },
    onSuccess: () => {
      toast.success('Attachment uploaded')
      qc.invalidateQueries({ queryKey: ['inquiry-attachments', inquiryId] })
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Upload failed')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/inquiries/${inquiryId}/attachments/${id}`),
    onSuccess: () => {
      toast.success('Attachment removed')
      qc.invalidateQueries({ queryKey: ['inquiry-attachments', inquiryId] })
    },
    onError: () => toast.error('Delete failed'),
  })

  const handleFiles = (files: FileList | File[] | null) => {
    if (!files) return
    Array.from(files).forEach(f => uploadMutation.mutate(f))
  }

  const attachments = data?.data ?? []

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide font-bold text-t-secondary">
          <Paperclip size={11} />
          Attachments {attachments.length > 0 && <span className="text-primary-400 ml-0.5">({attachments.length})</span>}
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="p-1 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white disabled:opacity-50"
          title="Upload"
        >
          {uploadMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          onChange={e => { handleFiles(e.target.files); if (inputRef.current) inputRef.current.value = '' }}
        />
      </div>

      {/* Drop zone — also clickable */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={`rounded-lg border-2 border-dashed text-center py-4 px-3 cursor-pointer transition-colors mb-2 ${
          dragOver
            ? 'border-primary-500 bg-primary-500/[0.05]'
            : 'border-dark-border hover:border-white/20 bg-dark-surface2/40'
        }`}
      >
        <Upload size={16} className="mx-auto text-t-secondary mb-1" />
        <div className="text-[11px] text-t-secondary">
          Drop files or <span className="text-primary-300 font-medium">click to browse</span>
        </div>
        <div className="text-[10px] text-gray-600 mt-0.5">{ALLOWED_HINT}</div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-3 text-xs text-t-secondary">
          <Loader2 size={13} className="inline animate-spin" /> Loading…
        </div>
      ) : attachments.length === 0 ? null : (
        <div className="space-y-1.5">
          {attachments.map(a => {
            const Icon = iconFor(a.mime_type)
            return (
              <div key={a.id} className="flex items-center gap-2 text-xs bg-dark-surface2 rounded-lg px-2.5 py-2 group">
                <Icon size={13} className="text-primary-300 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white hover:text-primary-300 font-medium truncate block"
                    title={a.filename}
                  >
                    {a.filename}
                  </a>
                  <div className="text-[10px] text-gray-500 truncate">
                    {formatBytes(a.size_bytes)}
                    {a.uploader?.name && <> · by {a.uploader.name}</>}
                    {a.created_at && <> · {new Date(a.created_at).toLocaleDateString()}</>}
                  </div>
                </div>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-primary-300 hover:bg-white/5 transition"
                  title="Open"
                >
                  <Download size={11} />
                </a>
                <button
                  onClick={() => {
                    if (window.confirm(`Remove "${a.filename}"?`)) deleteMutation.mutate(a.id)
                  }}
                  disabled={deleteMutation.isPending}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-30"
                  title="Remove"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
