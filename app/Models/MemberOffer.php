<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MemberOffer extends Model
{
    protected $fillable = [
        'member_id', 'offer_id', 'ai_generated', 'ai_reason',
        'claimed_at', 'used_at', 'expires_at', 'status',
    ];

    protected $casts = [
        'ai_generated' => 'boolean',
        'claimed_at' => 'datetime',
        'used_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function member() { return $this->belongsTo(LoyaltyMember::class, 'member_id'); }
    public function offer() { return $this->belongsTo(SpecialOffer::class, 'offer_id'); }
}
