<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class KnowledgeDocument extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id',
        'file_name',
        'file_path',
        'mime_type',
        'size_bytes',
        'extracted_text',
        'chunks_count',
        'processing_status',
    ];

    protected $casts = [
        'size_bytes' => 'integer',
        'chunks_count' => 'integer',
    ];

    public function scopePending($query)
    {
        return $query->where('processing_status', 'pending');
    }

    public function scopeCompleted($query)
    {
        return $query->where('processing_status', 'completed');
    }
}
