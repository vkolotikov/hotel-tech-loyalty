<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;

class EmailTemplate extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id', 'name', 'subject', 'html_body', 'merge_tags',
        'category', 'is_active', 'created_by',
    ];

    protected $casts = [
        'merge_tags' => 'array',
        'is_active'  => 'boolean',
    ];

    /**
     * All supported merge tags with descriptions.
     */
    public const AVAILABLE_TAGS = [
        '{{member_name}}'      => 'Member full name',
        '{{first_name}}'       => 'Member first name',
        '{{email}}'            => 'Member email address',
        '{{member_number}}'    => 'Loyalty card number',
        '{{tier_name}}'        => 'Current tier (e.g. Gold)',
        '{{points_balance}}'   => 'Current points balance',
        '{{lifetime_points}}'  => 'Lifetime points total',
        '{{referral_code}}'    => 'Member referral code',
        '{{hotel_name}}'       => 'Hotel/brand name',
        '{{current_year}}'     => 'Current year',
    ];

    /**
     * Render this template for a specific member.
     */
    public function render(LoyaltyMember $member, array $extraTags = []): array
    {
        $member->loadMissing(['user', 'tier']);

        $hotelName = HotelSetting::getValue('company_name', 'Hotel Loyalty');

        $replacements = [
            '{{member_name}}'      => $member->user->name ?? '',
            '{{first_name}}'       => explode(' ', $member->user->name ?? '')[0],
            '{{email}}'            => $member->user->email ?? '',
            '{{member_number}}'    => $member->member_number ?? '',
            '{{tier_name}}'        => $member->tier->name ?? '',
            '{{points_balance}}'   => number_format($member->current_points),
            '{{lifetime_points}}'  => number_format($member->lifetime_points),
            '{{referral_code}}'    => $member->referral_code ?? '',
            '{{hotel_name}}'       => $hotelName,
            '{{current_year}}'     => date('Y'),
            ...$extraTags,
        ];

        return [
            'subject' => str_replace(array_keys($replacements), array_values($replacements), $this->subject),
            'html'    => str_replace(array_keys($replacements), array_values($replacements), $this->html_body),
        ];
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
