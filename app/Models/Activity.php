<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row in the unified activity timeline on a lead detail page.
 *
 * Every touch on an inquiry — note, call, email, chat conversation,
 * status change, task completion, file attachment, system event —
 * lands here as an activity row. The frontend timeline reads this
 * single table sorted by `occurred_at` desc; sub-tabs filter by
 * `type`.
 *
 * The "Touches" counter on the Sales Pipeline list is now derived
 * from `activities.where(inquiry_id=…).count()` rather than a manual
 * increment. Existing chat conversations are backfilled into rows of
 * type=chat by a separate seeder run from the API once a brand is
 * picked (we can't write to brand-scoped tables in a migration that
 * runs before brand context is bound).
 */
class Activity extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'brand_id',
        'inquiry_id', 'guest_id', 'corporate_account_id',
        'type', 'direction', 'subject', 'body',
        'duration_minutes', 'metadata',
        'created_by', 'occurred_at',
    ];

    protected $casts = [
        'metadata'         => 'array',
        'duration_minutes' => 'integer',
        'occurred_at'      => 'datetime',
    ];

    public function inquiry(): BelongsTo
    {
        return $this->belongsTo(Inquiry::class);
    }

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
