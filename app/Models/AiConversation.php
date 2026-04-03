<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class AiConversation extends Model
{
    use BelongsToOrganization;

    protected $fillable = ['member_id', 'session_id', 'messages', 'tokens_used', 'model', 'is_active', 'organization_id'];

    protected $casts = [
        'messages' => 'array',
        'is_active' => 'boolean',
    ];

    public function member() { return $this->belongsTo(LoyaltyMember::class, 'member_id'); }
}
