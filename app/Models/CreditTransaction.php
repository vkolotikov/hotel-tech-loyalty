<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of a member's cashback credit (release 7, spec 2026-10-25 §3): `earn` (+), `spend` (−), `reverse` (−, a
 * refunded or cancelled booking's cashback) or `adjust` (±, a manager's correction, a merge, an erasure), with the
 * balance after it and the venue's currency.
 *
 * Written only by App\Services\Loyalty\Credit\CreditLedger, under the member row lock, with the organisation named
 * explicitly (and the bound tenant set to it): nothing is mass-assigned, so no request field can reach a column.
 */
class CreditTransaction extends Model
{
    use BelongsToOrganization;

    public const EARN = 'earn';
    public const SPEND = 'spend';
    public const REVERSE = 'reverse';
    public const ADJUST = 'adjust';

    protected $table = 'credit_transactions';

    /** The ledger writes with forceFill(); nothing reaches a column by mass assignment. */
    protected $guarded = ['*'];

    protected $casts = [
        'amount'        => 'decimal:2',
        'balance_after' => 'decimal:2',
        'reference_id'  => 'integer',
        'created_by'    => 'integer',
    ];

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
