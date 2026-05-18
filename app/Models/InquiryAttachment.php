<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InquiryAttachment extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'inquiry_id', 'uploaded_by',
        'filename', 'url', 'mime_type', 'size_bytes', 'note',
    ];

    protected $casts = [
        'size_bytes' => 'integer',
    ];

    public function inquiry(): BelongsTo
    {
        return $this->belongsTo(Inquiry::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
