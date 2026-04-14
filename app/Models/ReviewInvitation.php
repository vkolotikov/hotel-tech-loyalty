<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

class ReviewInvitation extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'form_id', 'guest_id', 'loyalty_member_id',
        'token', 'channel', 'status', 'sent_at', 'opened_at',
        'submitted_at', 'expires_at', 'metadata',
    ];

    protected $casts = [
        'metadata'     => 'array',
        'sent_at'      => 'datetime',
        'opened_at'    => 'datetime',
        'submitted_at' => 'datetime',
        'expires_at'   => 'datetime',
    ];

    public static function booted(): void
    {
        static::creating(function (self $m) {
            if (!$m->token) {
                $m->token = Str::random(40);
            }
        });
    }

    public function form(): BelongsTo
    {
        return $this->belongsTo(ReviewForm::class, 'form_id');
    }

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'loyalty_member_id');
    }

    public function submission(): HasOne
    {
        return $this->hasOne(ReviewSubmission::class, 'invitation_id');
    }
}
