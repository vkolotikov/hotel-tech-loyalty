<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An event a venue runs and members attend (release 8, spec 2026-10-25 §4): when (`starts_at`, `ends_at` — the venue's
 * wall clock, stored as written, never converted), where (a place or a written location), who (`admits` `all` or the
 * tiers in `loyalty_event_tiers`), what attending gives (`points`, `counts_as_visit`), whether members sign up in the
 * portal (`sign_up`, `capacity`, `walk_ins`), and its `status` (`draft`, `published`, `cancelled`).
 *
 * Written only by App\Services\Loyalty\Events\*. Nothing is mass-assigned.
 */
class LoyaltyEvent extends Model
{
    use BelongsToOrganization;

    public const DRAFT = 'draft';
    public const PUBLISHED = 'published';
    public const CANCELLED = 'cancelled';

    protected $table = 'loyalty_events';

    /** The Events services write with forceFill(). */
    protected $guarded = ['*'];

    protected $casts = [
        'points'          => 'integer',
        'counts_as_visit' => 'boolean',
        'sign_up'         => 'boolean',
        'walk_ins'        => 'boolean',
        'capacity'        => 'integer',
    ];

    public function place(): BelongsTo
    {
        return $this->belongsTo(AccessPlace::class, 'access_place_id');
    }

    /** The tiers an event with `admits = tiers` is for. */
    public function tiers(): BelongsToMany
    {
        return $this->belongsToMany(LoyaltyTier::class, 'loyalty_event_tiers', 'loyalty_event_id', 'tier_id');
    }

    public function registrations(): HasMany
    {
        return $this->hasMany(EventRegistration::class, 'loyalty_event_id');
    }

    public function attendances(): HasMany
    {
        return $this->hasMany(EventAttendance::class, 'loyalty_event_id');
    }
}
