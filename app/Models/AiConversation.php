<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiConversation extends Model
{
    protected $fillable = ['member_id', 'session_id', 'messages', 'tokens_used', 'model', 'is_active'];

    protected $casts = [
        'messages' => 'array',
        'is_active' => 'boolean',
    ];

    public function member() { return $this->belongsTo(LoyaltyMember::class, 'member_id'); }
}
