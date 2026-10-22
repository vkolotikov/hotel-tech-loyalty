<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One CSV member-import run, driven to completion in chunks.
 *
 * The uploaded file is kept in the row (`file_content`, HexaTech Loyalty release 3 §2) from the preview to the last
 * chunk, then cleared: the local disk it used to live on (`stored_path`) is lost on a deploy on Laravel Cloud and not
 * shared between replicas. A batch previewed before release 3 still names its `stored_path`, read while it is there.
 *
 * @see \App\Services\MemberImportService
 */
class MemberImportBatch extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'uuid', 'organization_id', 'brand_id', 'created_by_user_id',
        'original_filename', 'stored_path', 'file_content', 'file_rows', 'total_rows',
        'processed', 'ok_count', 'skip_count', 'error_count', 'points_awarded',
        'status', 'error_message', 'results', 'columns_used', 'columns_ignored',
        'started_at', 'completed_at',
    ];

    /** Every column but the stored file, for lists: an unfinished batch's file can be megabytes no list needs. */
    public const LIST_COLUMNS = [
        'id', 'uuid', 'organization_id', 'brand_id', 'created_by_user_id',
        'original_filename', 'stored_path', 'file_rows', 'total_rows',
        'processed', 'ok_count', 'skip_count', 'error_count', 'points_awarded',
        'status', 'error_message', 'results', 'columns_used', 'columns_ignored',
        'started_at', 'completed_at', 'created_at', 'updated_at',
    ];

    /** The file is the operator's members' data: never in an array or JSON form of the batch. */
    protected $hidden = ['file_content'];

    protected $casts = [
        'results'         => 'array',
        'columns_used'    => 'array',
        'columns_ignored' => 'array',
        'started_at'      => 'datetime',
        'completed_at'    => 'datetime',
    ];

    /**
     * The `file_content` form of an uploaded file: its raw bytes, gzip-compressed, then base64. The parser later reads
     * exactly the bytes that were uploaded (BOM, delimiter, any encoding), and the column holds only ASCII, which a
     * PostgreSQL `text` column accepts whatever the file's encoding; a CSV shrinks several times under gzip.
     */
    public static function encodeFile(string $bytes): string
    {
        return base64_encode((string) gzencode($bytes, 6));
    }

    /**
     * The uploaded file's bytes: from the row, else (a batch previewed before release 3) from `stored_path` while that
     * file is still on this server's disk. Null when neither can be read.
     */
    public function fileBytes(): ?string
    {
        $stored = $this->getAttributes()['file_content'] ?? null;
        if (is_string($stored) && $stored !== '') {
            $gzip = base64_decode($stored, true);
            $bytes = $gzip === false ? false : @gzdecode($gzip);

            return $bytes === false ? null : $bytes;
        }
        $path = (string) $this->stored_path;
        if ($path !== '' && is_file($path) && is_readable($path)) {
            $bytes = @file_get_contents($path);

            return $bytes === false ? null : $bytes;
        }

        return null;
    }

    /** @param Builder<MemberImportBatch> $query */
    public function scopeWithoutFile(Builder $query): void
    {
        $query->select(array_map(fn (string $column) => $this->qualifyColumn($column), self::LIST_COLUMNS));
    }

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
