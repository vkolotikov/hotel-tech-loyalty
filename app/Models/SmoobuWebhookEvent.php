<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Dedup record for an incoming Smoobu webhook delivery. We hash the
 * canonicalised body and insert one row per logical event. The unique
 * index on body_hash makes duplicate inserts throw a 23505, which the
 * controller catches and turns into a 200 no-op response.
 *
 * Org binding intentionally NOT enforced via BelongsToOrganization —
 * webhook arrival precedes tenant resolution, and we need to be able
 * to look up "have I seen this exact body before?" cross-tenant for
 * replay protection.
 */
class SmoobuWebhookEvent extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'organization_id', 'body_hash', 'action', 'reservation_id', 'received_at',
    ];

    protected $casts = [
        'received_at' => 'datetime',
    ];

    /**
     * Canonicalise + hash a webhook body so identical replays produce
     * the same hash. JSON encode (sorted keys) → SHA-256.
     */
    public static function hashBody(array $body): string
    {
        $canonical = self::canonicalise($body);
        return hash('sha256', json_encode($canonical, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    /**
     * Recursively sort assoc-array keys so {"a":1,"b":2} and {"b":2,"a":1}
     * produce the same hash. List arrays (numeric keys) keep their order
     * since order is semantic for lists.
     */
    private static function canonicalise(mixed $value): mixed
    {
        if (!is_array($value)) return $value;
        $isAssoc = array_keys($value) !== range(0, count($value) - 1);
        $value = array_map([self::class, 'canonicalise'], $value);
        if ($isAssoc) ksort($value);
        return $value;
    }
}
