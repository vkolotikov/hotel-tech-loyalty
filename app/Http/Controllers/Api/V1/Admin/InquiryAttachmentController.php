<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Inquiry;
use App\Models\InquiryAttachment;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * File attachments on inquiries — proposals, contracts, signed BEOs, etc.
 *
 * Routes:
 *   GET    /v1/admin/inquiries/{inquiry}/attachments
 *   POST   /v1/admin/inquiries/{inquiry}/attachments    (multipart, field `file`)
 *   DELETE /v1/admin/inquiries/{inquiry}/attachments/{attachment}
 *
 * Storage: uses the platform's MediaService (auto-detects DO Spaces / local
 * disk). 25 MB cap per file — enough for the typical PDF proposal /
 * contract / signed BEO; oversized media (videos, raw photos) belong
 * elsewhere.
 */
class InquiryAttachmentController extends Controller
{
    private const MAX_FILE_MB = 25;
    private const ALLOWED_MIME = [
        // Documents
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain', 'text/csv',
        // Images
        'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
        // Archives (for proposal bundles)
        'application/zip', 'application/x-zip-compressed',
    ];

    public function index(int $inquiryId): JsonResponse
    {
        // Explicit lookup so cross-tenant 404 has a clean message instead
        // of a silent TenantScope miss — same pattern as GuestController::show.
        $inquiry = Inquiry::find($inquiryId);
        if (!$inquiry) {
            return response()->json(['message' => 'Inquiry not found in your organization.'], 404);
        }

        return response()->json([
            'data' => $inquiry->attachments()
                ->with('uploader:id,name')
                ->get()
                ->map(fn ($a) => $this->present($a))
                ->all(),
        ]);
    }

    public function store(Request $request, int $inquiryId): JsonResponse
    {
        $inquiry = Inquiry::find($inquiryId);
        if (!$inquiry) {
            return response()->json(['message' => 'Inquiry not found in your organization.'], 404);
        }

        $request->validate([
            'file' => 'required|file|max:' . (self::MAX_FILE_MB * 1024),
            'note' => 'nullable|string|max:500',
        ]);

        $file = $request->file('file');
        if (!in_array($file->getMimeType(), self::ALLOWED_MIME, true)) {
            return response()->json([
                'message' => 'File type not allowed: ' . $file->getMimeType(),
            ], 422);
        }

        try {
            $url = MediaService::upload($file, 'inquiry-attachments');
        } catch (\Throwable $e) {
            \Log::error('Inquiry attachment upload failed', [
                'inquiry_id' => $inquiryId,
                'error'      => $e->getMessage(),
            ]);
            return response()->json([
                'message' => 'Upload failed: ' . $e->getMessage(),
            ], 500);
        }

        $attachment = InquiryAttachment::create([
            'inquiry_id' => $inquiry->id,
            'uploaded_by' => $request->user()?->id,
            'filename'   => $file->getClientOriginalName(),
            'url'        => $url,
            'mime_type'  => $file->getMimeType(),
            'size_bytes' => $file->getSize(),
            'note'       => $request->input('note'),
        ]);

        return response()->json($this->present($attachment->fresh('uploader')), 201);
    }

    public function destroy(int $inquiryId, int $attachmentId): JsonResponse
    {
        $inquiry = Inquiry::find($inquiryId);
        if (!$inquiry) {
            return response()->json(['message' => 'Inquiry not found in your organization.'], 404);
        }

        $attachment = InquiryAttachment::where('inquiry_id', $inquiry->id)
            ->where('id', $attachmentId)
            ->first();
        if (!$attachment) {
            return response()->json(['message' => 'Attachment not found.'], 404);
        }

        // Best-effort storage cleanup. If it fails (file already gone, disk
        // unavailable), the row deletion still proceeds — orphan files on
        // the media disk are fine, missing DB rows are worse.
        try {
            MediaService::delete($attachment->url);
        } catch (\Throwable $e) {
            \Log::info('Inquiry attachment storage delete failed (continuing)', [
                'attachment_id' => $attachment->id,
                'error'         => $e->getMessage(),
            ]);
        }

        $attachment->delete();
        return response()->json(['success' => true]);
    }

    private function present(InquiryAttachment $a): array
    {
        return [
            'id'         => $a->id,
            'filename'   => $a->filename,
            'url'        => $a->url,
            'mime_type'  => $a->mime_type,
            'size_bytes' => $a->size_bytes,
            'note'       => $a->note,
            'uploader'   => $a->uploader ? ['id' => $a->uploader->id, 'name' => $a->uploader->name] : null,
            'created_at' => $a->created_at?->toIso8601String(),
        ];
    }
}
