<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int|null $organization_id
 * @property int|null $member_id
 * @property int|null $card_batch_id
 * @property string|null $uid
 * @property string|null $printed_number
 * @property string|null $printed_qr_token
 */
class NfcCard extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'member_id', 'uid', 'card_type', 'issued_at', 'issued_by',
        'last_scanned_at', 'last_scanned_by', 'scan_count', 'is_active', 'notes',
    ];

    protected $hidden = ['card_batch_id', 'printed_number', 'printed_qr_token'];

    protected $casts = [
        'issued_at' => 'datetime',
        'last_scanned_at' => 'datetime',
        'is_active' => 'boolean',
    ];

    public function scopePrinted(Builder $query): Builder
    {
        return $query->whereNotNull('card_batch_id');
    }

    /** @return BelongsTo<LoyaltyMember, $this> */
    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }

    public function issuedBy() { return $this->belongsTo(User::class, 'issued_by'); }
}
