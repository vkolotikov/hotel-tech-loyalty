<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One named filter combination saved by a user, scoped to a specific
 * admin page (today only `inquiries` — Phase 4 will add tasks +
 * reservations). Stored as JSON verbatim so the front-end can paste
 * the row's filters back onto the table without server interpretation.
 */
class SavedView extends Model
{
    use BelongsToOrganization;

    protected $table = 'crm_saved_views';

    protected $fillable = [
        'organization_id', 'user_id',
        'page', 'name', 'filters', 'is_pinned', 'sort_order',
    ];

    protected $casts = [
        'filters'    => 'array',
        'is_pinned'  => 'boolean',
        'sort_order' => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
