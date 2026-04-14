<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToOrganization;

class CampaignRecipient extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'campaign_id', 'loyalty_member_id',
        'channel', 'email', 'status', 'sent_at', 'opened_at',
        'open_count', 'error',
    ];

    protected $casts = [
        'sent_at'    => 'datetime',
        'opened_at'  => 'datetime',
        'open_count' => 'integer',
    ];

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(NotificationCampaign::class, 'campaign_id');
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'loyalty_member_id');
    }
}
