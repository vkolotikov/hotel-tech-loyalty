<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A place a venue admits members to — an entrance, a lounge, a spa (release 8, spec 2026-10-25 §1). `admits` is `all`
 * (every member whose membership stands) or `tiers` (only the tiers in `access_place_tiers`).
 *
 * Written only by App\Services\Loyalty\Access\AccessPlaces; who gets in is decided only by AccessDecision. Nothing is
 * mass-assigned.
 */
class AccessPlace extends Model
{
    use BelongsToOrganization;

    public const ADMITS_ALL = 'all';
    public const ADMITS_TIERS = 'tiers';

    protected $table = 'access_places';

    /** AccessPlaces writes with forceFill(). */
    protected $guarded = ['*'];

    protected $casts = [
        'sort_order' => 'integer',
        'is_active'  => 'boolean',
    ];

    /** The tiers a place with `admits = tiers` lets in. */
    public function tiers(): BelongsToMany
    {
        return $this->belongsToMany(LoyaltyTier::class, 'access_place_tiers', 'access_place_id', 'tier_id');
    }
}
