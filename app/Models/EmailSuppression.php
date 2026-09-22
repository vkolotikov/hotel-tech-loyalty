<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * An address we must not email, and why.
 *
 * Deliberately NOT tenant-scoped via BelongsToOrganization. Two reasons:
 *
 *  1. A platform-wide row (organization_id = null) has to be visible from
 *     inside every tenant's context — TenantScope would hide exactly the rows
 *     that matter most.
 *  2. The send-time check runs from queued jobs and console commands where no
 *     org may be bound at all, and TenantScope fails closed — it would return
 *     nothing and we would happily mail every suppressed address.
 *
 * Scoping is therefore explicit, in isSuppressed(). Read that before changing
 * anything here.
 */
class EmailSuppression extends Model
{
    /** A mailbox that does not exist. Permanent, platform-wide. */
    public const HARD_BOUNCE = 'hard_bounce';
    /** Recipient pressed "this is spam". Permanent, platform-wide, and the
     *  single most damaging signal to a sending reputation. */
    public const COMPLAINT = 'complaint';
    /** Repeated temporary failures — full mailbox, greylisting that never
     *  cleared. Suppressed only after SOFT_BOUNCE_LIMIT attempts. */
    public const SOFT_BOUNCE = 'soft_bounce_threshold';
    /** Member opted out of one tenant's mail. Scoped to that tenant. */
    public const UNSUBSCRIBE = 'unsubscribe';
    /** An operator added it by hand. */
    public const MANUAL = 'manual';
    /** Syntactically invalid or provider-rejected address. */
    public const INVALID = 'invalid';

    /**
     * Soft bounces are transient by definition, so one is not evidence of
     * anything. Five consecutive failures is.
     */
    public const SOFT_BOUNCE_LIMIT = 5;

    protected $fillable = [
        'organization_id', 'email', 'reason', 'source', 'detail',
        'failure_count', 'last_failed_at',
    ];

    protected $casts = [
        'failure_count'  => 'integer',
        'last_failed_at' => 'datetime',
    ];

    /**
     * Addresses are compared case-insensitively in practice, so store and look
     * up one canonical form. A suppression that misses because someone typed a
     * capital letter is worse than no suppression at all — it reads as working.
     */
    public static function normalise(string $email): string
    {
        return mb_strtolower(trim($email));
    }

    /**
     * May we send to this address, for this org?
     *
     * Matches a platform-wide row (organization_id IS NULL) OR a row scoped to
     * this org. A hard bounce or complaint is a property of the ADDRESS and is
     * recorded platform-wide; an unsubscribe belongs to one tenant, because
     * opting out of one venue is not opting out of another.
     */
    public static function isSuppressed(string $email, ?int $organizationId = null): bool
    {
        $email = self::normalise($email);
        if ($email === '') {
            return true; // nothing to send to
        }

        return static::query()
            ->where('email', $email)
            ->where(function ($q) use ($organizationId) {
                $q->whereNull('organization_id');
                if ($organizationId) {
                    $q->orWhere('organization_id', $organizationId);
                }
            })
            // A soft-bounce row is a COUNTER, not yet a suppression. Mailboxes
            // fill up and greylisting clears, so silencing an address after one
            // temporary failure would lose real recipients. It only becomes an
            // active suppression once the failures are clearly not transient.
            ->where(function ($q) {
                $q->where('reason', '!=', self::SOFT_BOUNCE)
                  ->orWhere('failure_count', '>=', self::SOFT_BOUNCE_LIMIT);
            })
            ->exists();
    }

    /**
     * Record a suppression, or bump the failure counter if it already exists.
     *
     * Idempotent on purpose: providers redeliver webhooks, and a duplicate
     * bounce notification must not create a second row or lose the original
     * reason.
     */
    public static function suppress(
        string $email,
        string $reason,
        ?int $organizationId = null,
        string $source = 'manual',
        ?string $detail = null,
    ): ?self {
        $email = self::normalise($email);
        if ($email === '') {
            return null;
        }

        $row = static::firstOrNew([
            'organization_id' => $organizationId,
            'email'           => $email,
        ]);

        if ($row->exists) {
            $row->failure_count = (int) $row->failure_count + 1;
        } else {
            $row->reason        = $reason;
            $row->source        = $source;
            $row->failure_count = 1;
        }

        // A permanent reason always wins. A complaint arriving after a soft
        // bounce must upgrade the row, never be swallowed by it.
        if (in_array($reason, [self::HARD_BOUNCE, self::COMPLAINT], true)) {
            $row->reason = $reason;
            $row->source = $source;
        }

        $row->detail         = $detail ?: $row->detail;
        $row->last_failed_at = now();
        $row->save();

        return $row;
    }
}
