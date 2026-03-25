<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MemberIdentity extends Model
{
    protected $fillable = [
        'member_id', 'type', 'identifier', 'provider',
        'is_verified', 'is_primary', 'verified_at',
    ];

    protected $casts = [
        'is_verified' => 'boolean',
        'is_primary'  => 'boolean',
        'verified_at' => 'datetime',
    ];

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }
}
