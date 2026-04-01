<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiRecommendation extends Model
{
    protected $fillable = [
        'member_id', 'type', 'recommendation', 'context',
        'confidence_score', 'acted_on', 'acted_on_at', 'expires_at',
    ];

    protected $casts = [
        'context'          => 'array',
        'confidence_score' => 'decimal:2',
        'acted_on'         => 'boolean',
        'acted_on_at'      => 'datetime',
        'expires_at'       => 'datetime',
    ];

    public function member() { return $this->belongsTo(LoyaltyMember::class, 'member_id'); }
}
