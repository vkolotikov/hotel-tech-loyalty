<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScanEvent extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'member_id', 'property_id', 'staff_id', 'scan_type',
        'token_value', 'result', 'action_taken', 'transaction_id',
        'device_id', 'ip_address',
    ];

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function staff(): BelongsTo
    {
        return $this->belongsTo(User::class, 'staff_id');
    }

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(PointsTransaction::class, 'transaction_id');
    }
}
