<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\BelongsToOrganization;

class PointsTransaction extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'member_id', 'property_id', 'outlet_id',
        'type', 'points', 'qualifying_points', 'balance_after', 'description',
        'reference_type', 'reference_id', 'source_type', 'source_id',
        'staff_id', 'amount_spent', 'earn_rate',
        'idempotency_key', 'reversal_of_id', 'is_reversed',
        'reason_code', 'approval_status', 'approved_by', 'approved_at',
        'expiry_bucket_id', 'expires_at',
    ];

    protected $casts = [
        'expires_at'   => 'datetime',
        'approved_at'  => 'datetime',
        'amount_spent' => 'decimal:2',
        'earn_rate'    => 'decimal:2',
        'is_reversed'  => 'boolean',
    ];

    public function member()
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }

    public function staff()
    {
        return $this->belongsTo(User::class, 'staff_id');
    }

    public function property()
    {
        return $this->belongsTo(Property::class);
    }

    public function outlet()
    {
        return $this->belongsTo(Outlet::class);
    }

    public function reversalOf()
    {
        return $this->belongsTo(self::class, 'reversal_of_id');
    }

    public function reversals()
    {
        return $this->hasMany(self::class, 'reversal_of_id');
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function expiryBucket()
    {
        return $this->belongsTo(PointExpiryBucket::class);
    }
}
