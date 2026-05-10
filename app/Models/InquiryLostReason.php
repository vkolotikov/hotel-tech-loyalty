<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Lookup taxonomy for the required-on-Lost reason picker. Seeded with
 * a default 6-item list per org by the CRM Phase 1 migration; admins
 * can edit / extend in Settings → Pipelines (Phase 3).
 */
class InquiryLostReason extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'label', 'slug', 'sort_order', 'is_active',
    ];

    protected $casts = [
        'sort_order' => 'integer',
        'is_active'  => 'boolean',
    ];

    public function inquiries(): HasMany
    {
        return $this->hasMany(Inquiry::class, 'lost_reason_id');
    }
}
