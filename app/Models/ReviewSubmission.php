<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReviewSubmission extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'form_id', 'invitation_id',
        'device_id', 'channel',
        'guest_id', 'loyalty_member_id',
        'overall_rating', 'nps_score', 'answers', 'comment',
        'redirected_externally', 'external_platform',
        'ip', 'user_agent',
        'anonymous_name', 'anonymous_email',
        'submitted_at', 'is_featured',
    ];

    protected $casts = [
        'answers'               => 'array',
        'redirected_externally' => 'boolean',
        'submitted_at'          => 'datetime',
        'overall_rating'        => 'integer',
        'nps_score'             => 'integer',
        'is_featured'           => 'boolean',
    ];

    public function form(): BelongsTo
    {
        return $this->belongsTo(ReviewForm::class, 'form_id');
    }

    public function invitation(): BelongsTo
    {
        return $this->belongsTo(ReviewInvitation::class, 'invitation_id');
    }

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'loyalty_member_id');
    }

    /**
     * Reviews a venue has chosen to display publicly.
     *
     * Deliberately not "rating >= 4": presenting a filtered subset as though
     * it were all reviews is an unfair commercial practice under UK CMA and
     * EU consumer rules. A person chooses, and the page says so.
     */
    public function scopeFeatured($query)
    {
        return $query->where('is_featured', true);
    }
}
