<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/**
 * An SMS campaign of HexaTech Loyalty (release 4 §5, R4-4): a text to a segment's members who turned "Offers by SMS"
 * on, sent through the venue's own Twilio account. Written only through the workspace's SmsController and
 * Loyalty\Sms\SmsStart (start, schedule) and the SendSmsCampaignChunk job; its members' outcomes are its
 * sms_campaign_deliveries rows.
 */
class SmsCampaign extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'member_segment_id', 'name', 'body', 'status', 'recipient_count', 'scheduled_at', 'sent_at',
        'error_message', 'created_by_user_id', 'sent_by_user_id',
    ];

    protected $casts = [
        'recipient_count' => 'integer',
        'scheduled_at'    => 'datetime',
        'sent_at'         => 'datetime',
    ];
}
