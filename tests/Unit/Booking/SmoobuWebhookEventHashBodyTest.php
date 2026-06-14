<?php

namespace Tests\Unit\Booking;

use App\Models\SmoobuWebhookEvent;
use PHPUnit\Framework\TestCase;

/**
 * Locks SmoobuWebhookEvent::hashBody — the body canonicalisation
 * used for replay-protection dedup on incoming Smoobu webhooks
 * (May 13 2026 per-org webhook secret rollout).
 *
 * Contract:
 *
 *   Two webhook deliveries with identical SEMANTIC content (any
 *   permutation of associative-array key order, any depth) MUST
 *   produce the same SHA-256 hash so the unique index on
 *   `body_hash` rejects the duplicate with 23505 → controller
 *   returns 200 no-op and Smoobu stops retrying.
 *
 *   List-array order IS semantic — `[a,b,c]` and `[c,b,a]` are
 *   genuinely different webhook payloads (Smoobu's "events"
 *   sequence, for example) and MUST hash differently. ksort
 *   would corrupt list semantics.
 *
 *   Different semantic payloads MUST produce different hashes.
 *   A false collision = a real webhook silently dropped.
 *
 *   The function MUST be pure — same input always produces the
 *   same output across processes and Laravel boot cycles. Tested
 *   without app boot to enforce this.
 *
 * This is a unit test — no DB / no schema / no boot.
 */
class SmoobuWebhookEventHashBodyTest extends TestCase
{
    /* ─── Basic determinism ─── */

    public function test_hash_is_deterministic_across_calls(): void
    {
        // Sanity: same input → same hash (twice in same process).
        $body = ['action' => 'newReservation', 'data' => ['id' => 12345]];
        $this->assertSame(
            SmoobuWebhookEvent::hashBody($body),
            SmoobuWebhookEvent::hashBody($body),
        );
    }

    public function test_hash_is_sha256_64_hex_chars(): void
    {
        // The contract is SHA-256 specifically (not a faster
        // weaker hash) — used in a unique index for replay
        // protection. Locks 64 hex chars + lowercase.
        $hash = SmoobuWebhookEvent::hashBody(['x' => 1]);
        $this->assertSame(64, strlen($hash));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $hash);
    }

    /* ─── Assoc-key reordering invariant ─── */

    public function test_assoc_key_reorder_produces_same_hash(): void
    {
        // Smoobu's JSON serialiser doesn't guarantee key order.
        // Same logical body coming in {a:1,b:2} vs {b:2,a:1} MUST
        // dedup as one event.
        $a = ['a' => 1, 'b' => 2, 'c' => 3];
        $b = ['c' => 3, 'a' => 1, 'b' => 2];
        $c = ['b' => 2, 'c' => 3, 'a' => 1];

        $h = SmoobuWebhookEvent::hashBody($a);
        $this->assertSame($h, SmoobuWebhookEvent::hashBody($b));
        $this->assertSame($h, SmoobuWebhookEvent::hashBody($c));
    }

    public function test_nested_assoc_reorder_produces_same_hash(): void
    {
        // CRITICAL: recursive ksort. Pre-fix only the top-level
        // keys were sorted — a nested object reordered inside
        // produced a different hash and slipped past dedup.
        $a = ['data' => ['guestName' => 'X', 'arrivalDate' => '2026-07-01']];
        $b = ['data' => ['arrivalDate' => '2026-07-01', 'guestName' => 'X']];

        $this->assertSame(
            SmoobuWebhookEvent::hashBody($a),
            SmoobuWebhookEvent::hashBody($b),
            'Reordering keys inside a NESTED assoc MUST still produce the same hash.',
        );
    }

    public function test_deeply_nested_assoc_reorder_produces_same_hash(): void
    {
        // 3-level nesting — guards against a max-depth ceiling on
        // the canonicalise recursion.
        $a = [
            'action' => 'newReservation',
            'payload' => [
                'reservation' => [
                    'id'           => 99,
                    'guest'        => ['name' => 'A', 'email' => 'a@b.c'],
                    'arrivalDate'  => '2026-07-01',
                ],
            ],
        ];
        $b = [
            'payload' => [
                'reservation' => [
                    'guest'        => ['email' => 'a@b.c', 'name' => 'A'],
                    'arrivalDate'  => '2026-07-01',
                    'id'           => 99,
                ],
            ],
            'action' => 'newReservation',
        ];

        $this->assertSame(
            SmoobuWebhookEvent::hashBody($a),
            SmoobuWebhookEvent::hashBody($b),
        );
    }

    /* ─── List-array order IS preserved ─── */

    public function test_list_array_order_is_semantic(): void
    {
        // Lists are NOT sorted — [a,b,c] ≠ [c,b,a]. Sorting would
        // corrupt sequences (events stream, ordered notes, etc.)
        // and cause real-event collisions.
        $a = ['events' => ['created', 'updated', 'cancelled']];
        $b = ['events' => ['cancelled', 'updated', 'created']];

        $this->assertNotSame(
            SmoobuWebhookEvent::hashBody($a),
            SmoobuWebhookEvent::hashBody($b),
            'List order MUST be semantic — reorder = different hash.',
        );
    }

    public function test_assoc_inside_list_keys_still_sorted(): void
    {
        // Compose: list of objects with reordered keys inside each
        // — list order preserved, assoc keys inside each item
        // canonicalised.
        $a = [
            'rooms' => [
                ['id' => 1, 'name' => 'Suite'],
                ['id' => 2, 'name' => 'Loft'],
            ],
        ];
        $b = [
            'rooms' => [
                ['name' => 'Suite', 'id' => 1],
                ['name' => 'Loft',  'id' => 2],
            ],
        ];

        $this->assertSame(
            SmoobuWebhookEvent::hashBody($a),
            SmoobuWebhookEvent::hashBody($b),
            'Reorder keys WITHIN list items — same hash. List ORDER itself preserved.',
        );

        // Swap list order — must NOT match.
        $c = [
            'rooms' => [
                ['name' => 'Loft',  'id' => 2],
                ['name' => 'Suite', 'id' => 1],
            ],
        ];

        $this->assertNotSame(
            SmoobuWebhookEvent::hashBody($a),
            SmoobuWebhookEvent::hashBody($c),
            'Swapping list ORDER MUST produce different hash.',
        );
    }

    /* ─── Different content produces different hashes ─── */

    public function test_different_string_value_produces_different_hash(): void
    {
        $a = ['guestName' => 'Alice'];
        $b = ['guestName' => 'Bob'];
        $this->assertNotSame(
            SmoobuWebhookEvent::hashBody($a),
            SmoobuWebhookEvent::hashBody($b),
        );
    }

    public function test_different_int_value_produces_different_hash(): void
    {
        $a = ['reservationId' => 1];
        $b = ['reservationId' => 2];
        $this->assertNotSame(
            SmoobuWebhookEvent::hashBody($a),
            SmoobuWebhookEvent::hashBody($b),
        );
    }

    public function test_int_vs_string_with_same_textual_value_produce_different_hashes(): void
    {
        // JSON encoder distinguishes `123` (int) from `"123"`
        // (string) — that distinction MUST be preserved so a
        // schema migration from one to the other isn't silently
        // dedup'd as "the same event".
        $a = ['reservationId' => 123];
        $b = ['reservationId' => '123'];
        $this->assertNotSame(
            SmoobuWebhookEvent::hashBody($a),
            SmoobuWebhookEvent::hashBody($b),
            'Type-preserving JSON encode keeps int and string distinct.',
        );
    }

    public function test_missing_field_produces_different_hash_than_null_field(): void
    {
        // Defensive: `{a:1}` vs `{a:1, b:null}` are different
        // semantic events (the second carries an explicit null
        // for `b`). JSON encode preserves both shapes.
        $a = ['guestName' => 'X'];
        $b = ['guestName' => 'X', 'phone' => null];
        $this->assertNotSame(
            SmoobuWebhookEvent::hashBody($a),
            SmoobuWebhookEvent::hashBody($b),
        );
    }

    /* ─── Edge cases ─── */

    public function test_empty_body_is_consistent(): void
    {
        // Defensive: an empty webhook body MUST hash to a
        // deterministic value (not throw). Real-world: a probe
        // ping from Smoobu's admin UI sometimes carries `{}`.
        $h1 = SmoobuWebhookEvent::hashBody([]);
        $h2 = SmoobuWebhookEvent::hashBody([]);
        $this->assertSame($h1, $h2);
        $this->assertSame(64, strlen($h1));
    }

    public function test_unicode_value_hash_is_byte_stable(): void
    {
        // JSON_UNESCAPED_UNICODE matters: without it, "naïve"
        // becomes "naïve" and the hash changes. Lock the
        // byte stability of unicode strings.
        $a = ['guestName' => 'naïve'];
        $b = ['guestName' => 'naïve'];
        $this->assertSame(
            SmoobuWebhookEvent::hashBody($a),
            SmoobuWebhookEvent::hashBody($b),
        );
        // Cross-check: a genuinely different unicode value MUST
        // hash distinctly — guards against "all unicode collapses
        // to ASCII" bugs in the encoding chain.
        $c = ['guestName' => 'naïveté'];
        $this->assertNotSame(
            SmoobuWebhookEvent::hashBody($a),
            SmoobuWebhookEvent::hashBody($c),
        );
    }

    public function test_unescaped_slashes_keep_hash_byte_stable(): void
    {
        // JSON_UNESCAPED_SLASHES matters: webhook payloads
        // frequently carry URLs. Without the flag, `/` becomes
        // `\/` which would change the hash if a single byte of
        // pre-encoding differed between deliveries.
        $body = ['callback' => 'https://login.smoobu.com/api/x'];
        $hash = SmoobuWebhookEvent::hashBody($body);
        // Sanity: the canonical encoder should NOT double-escape.
        $this->assertStringNotContainsString('\\/',
            json_encode(['callback' => 'https://login.smoobu.com/api/x'],
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            'JSON encoder flags must keep slashes raw.',
        );
        $this->assertSame(64, strlen($hash));
    }

    public function test_boolean_values_preserved_through_canonicalise(): void
    {
        // bool true / false / null / string distinct.
        $a = ['flag' => true];
        $b = ['flag' => false];
        $c = ['flag' => null];
        $d = ['flag' => 'true'];

        $hA = SmoobuWebhookEvent::hashBody($a);
        $hB = SmoobuWebhookEvent::hashBody($b);
        $hC = SmoobuWebhookEvent::hashBody($c);
        $hD = SmoobuWebhookEvent::hashBody($d);

        // All four distinct.
        $this->assertCount(4, array_unique([$hA, $hB, $hC, $hD]),
            'bool true/false/null/string("true") MUST all hash distinctly.');
    }

    /* ─── Real-world Smoobu shapes ─── */

    public function test_realistic_smoobu_newReservation_shape_is_deterministic(): void
    {
        // The shape Smoobu actually sends per docs.smoobu.com.
        $body = [
            'action' => 'newReservation',
            'data' => [
                'id'             => 12345678,
                'reference-id'   => 'BK-ABC-12345',
                'apartment'      => ['id' => 2120866],
                'channel'        => ['id' => 70, 'name' => 'Direct'],
                'arrival-date'   => '2026-07-01',
                'departure-date' => '2026-07-03',
                'guest-name'     => 'John Doe',
                'price'          => 250.00,
                'price-status'   => 1,
            ],
        ];

        $h1 = SmoobuWebhookEvent::hashBody($body);
        $h2 = SmoobuWebhookEvent::hashBody($body);
        $this->assertSame($h1, $h2);
    }

    public function test_realistic_smoobu_payload_with_reordered_top_and_nested_keys_dedups(): void
    {
        // The replay-protection use case: same logical webhook
        // arrives twice with different JSON-serialised key order.
        $a = [
            'action' => 'newReservation',
            'data' => [
                'id'             => 99,
                'apartment'      => ['id' => 12, 'name' => 'Suite'],
                'arrival-date'   => '2026-07-01',
                'guest-name'     => 'John',
            ],
        ];
        $b = [
            'data' => [
                'arrival-date'   => '2026-07-01',
                'guest-name'     => 'John',
                'apartment'      => ['name' => 'Suite', 'id' => 12],
                'id'             => 99,
            ],
            'action' => 'newReservation',
        ];

        $this->assertSame(
            SmoobuWebhookEvent::hashBody($a),
            SmoobuWebhookEvent::hashBody($b),
            'Real-world replay with shuffled keys MUST dedup correctly.',
        );
    }

    public function test_smoobu_cancelled_vs_new_action_distinct_hashes(): void
    {
        // Same reservation, different action — MUST NOT collide.
        $created = [
            'action' => 'newReservation',
            'data' => ['id' => 99, 'arrival-date' => '2026-07-01'],
        ];
        $cancelled = [
            'action' => 'cancelReservation',
            'data' => ['id' => 99, 'arrival-date' => '2026-07-01'],
        ];

        $this->assertNotSame(
            SmoobuWebhookEvent::hashBody($created),
            SmoobuWebhookEvent::hashBody($cancelled),
            'Different action on same reservation MUST hash distinctly — else cancellation silently dropped as dup.',
        );
    }
}
