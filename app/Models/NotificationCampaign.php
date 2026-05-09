<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;

class NotificationCampaign extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    /**
     * brand_id semantics: NULL = "targets all brands' members" (org-wide
     * campaign), specific id = brand-targeted campaign. Same opt-out
     * pattern as SpecialOffer when both rows are needed.
     */
    protected $fillable = [
        'organization_id', 'brand_id', 'property_id', 'name', 'segment_rules', 'title', 'body', 'data',
        'channel', 'email_template_id', 'email_subject', 'email_sent_count',
        'scheduled_at', 'sent_at', 'target_count', 'sent_count',
        'opened_count', 'status', 'created_by',
    ];

    protected $casts = [
        'segment_rules' => 'array',
        'data'          => 'array',
        'scheduled_at'  => 'datetime',
        'sent_at'       => 'datetime',
    ];

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }
}
