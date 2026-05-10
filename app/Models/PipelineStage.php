<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One column on a Kanban / one row in the Pipeline list view. The
 * `kind` field is what drives flow logic — only three values matter:
 *
 *   open   → in flight, counts toward forecast
 *   won    → moving here triggers Convert-to-reservation flow
 *   lost   → moving here requires a lost_reason capture
 *
 * Stage names are purely cosmetic; admins can rename them per pipeline.
 */
class PipelineStage extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'pipeline_id',
        'name', 'slug', 'color', 'kind',
        'sort_order', 'default_win_probability',
    ];

    protected $casts = [
        'sort_order'              => 'integer',
        'default_win_probability' => 'integer',
    ];

    public function pipeline(): BelongsTo
    {
        return $this->belongsTo(Pipeline::class);
    }

    public function inquiries(): HasMany
    {
        return $this->hasMany(Inquiry::class);
    }
}
