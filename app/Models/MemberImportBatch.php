<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One CSV member-import run, driven to completion in chunks.
 *
 * @see \App\Services\MemberImportService
 */
class MemberImportBatch extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'uuid', 'organization_id', 'brand_id', 'created_by_user_id',
        'original_filename', 'stored_path', 'file_rows', 'total_rows',
        'processed', 'ok_count', 'skip_count', 'error_count', 'points_awarded',
        'status', 'error_message', 'results', 'columns_used', 'columns_ignored',
        'started_at', 'completed_at',
    ];

    protected $casts = [
        'results'         => 'array',
        'columns_used'    => 'array',
        'columns_ignored' => 'array',
        'started_at'      => 'datetime',
        'completed_at'    => 'datetime',
    ];

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function isFinished(): bool
    {
        return in_array($this->status, ['completed', 'cancelled', 'failed'], true);
    }

    /** Rows still to process in this batch. */
    public function remaining(): int
    {
        return max(0, (int) $this->total_rows - (int) $this->processed);
    }

    public function progressPercent(): int
    {
        if ((int) $this->total_rows === 0) {
            return $this->isFinished() ? 100 : 0;
        }

        return (int) floor(min(100, ((int) $this->processed / (int) $this->total_rows) * 100));
    }
}
