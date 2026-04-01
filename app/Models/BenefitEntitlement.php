<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BenefitEntitlement extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'member_id', 'benefit_id', 'property_id', 'booking_id',
        'status', 'actioned_by', 'decline_reason',
        'requested_at', 'fulfilled_at',
    ];

    protected $casts = [
        'requested_at' => 'datetime',
        'fulfilled_at' => 'datetime',
    ];

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }

    public function benefit(): BelongsTo
    {
        return $this->belongsTo(BenefitDefinition::class, 'benefit_id');
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function actionedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actioned_by');
    }

    public function approve(User $staff): void
    {
        $this->update([
            'status'      => 'approved',
            'actioned_by' => $staff->id,
        ]);
    }

    public function fulfill(User $staff): void
    {
        $this->update([
            'status'       => 'fulfilled',
            'actioned_by'  => $staff->id,
            'fulfilled_at' => now(),
        ]);
    }

    public function decline(User $staff, string $reason): void
    {
        $this->update([
            'status'         => 'declined',
            'actioned_by'    => $staff->id,
            'decline_reason' => $reason,
        ]);
    }
}
