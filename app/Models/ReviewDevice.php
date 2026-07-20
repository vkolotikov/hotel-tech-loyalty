<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A registered feedback kiosk (reception iPad, spa counter tablet…).
 * The physical device opens /k/{device_key} once; the `form_id`
 * assignment decides which survey it renders, so admins repoint a
 * tablet from the office. The kiosk page re-checks its assignment
 * every 60s and reloads when it changes.
 */
class ReviewDevice extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'form_id', 'name', 'location',
        'device_key', 'is_active', 'last_seen_at',
    ];

    protected $casts = [
        'is_active'    => 'boolean',
        'last_seen_at' => 'datetime',
    ];

    public function form(): BelongsTo
    {
        return $this->belongsTo(ReviewForm::class, 'form_id');
    }

    /** Seen in the last 2 minutes = the kiosk page is open and polling. */
    public function getIsOnlineAttribute(): bool
    {
        return $this->last_seen_at !== null && $this->last_seen_at->gt(now()->subMinutes(2));
    }
}
