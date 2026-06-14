<?php

namespace Tests\Unit\Models;

use App\Models\SmoobuWebhookEvent;
use PHPUnit\Framework\TestCase;

/**
 * Locks the SmoobuWebhookEvent::hashBody() canonicalisation contract.
 *
 * Why this matters: webhook replay protection depends on identical
 * deliveries producing identical hashes. The unique index on
 * `smoobu_webhook_events.body_hash` is what turns a redelivered
 * webhook into a 200 no-op instead of a duplicate booking write.
 *
 * Three things can break that:
 *
 *   1. Key-order sensitivity — JSON serialisation order from
 *      Smoobu can vary across retries (different internal queue
 *      hops, different worker hosts, different SDK versions). The
 *      recursive ksort on assoc arrays guarantees order-independence.
 *      A regression here means duplicate deliveries land as new
 *      bookings.
 *
 *   2. List-array reordering — semantic order matters for arrays
 *      with numeric keys (e.g. a list of attached guest objects).
 *      Reordering changes meaning. canonicalise() correctly
 *      detects assoc vs list and only ksorts the former.
 *
 *   3. Encoding flags — JSON_UNESCAPED_SLASHES + JSON_UNESCAPED_UNICODE
 *      keep URLs and UTF-8 verbatim so a body that round-trips
 *      through different intermediaries stays canonical.
 *
 * CLAUDE.md flags this area as fragile: "if Smoobu ever adds
 * delivered_at / webhook_id per delivery, our SHA-256 dedup fails
 * open." This test set locks today's contract so a follow-up that
 * adds a known-noise allowlist (the documented future enhancement)
 * can ship behind a passing baseline.
 *
 * Pure unit test — no DB, no Eloquent boot. Wall time < 5ms.
 */
class SmoobuWebhookEventHashTest extends TestCase
{
    public function test_identical_body_produces_identical_hash(): void
    {
        // Sanity: same body twice → same hash. The minimal
        // round-trip property the dedup index relies on.
        $body = ['action' => 'created', 'data' => ['reservationId' => 12345]];

        $h1 = SmoobuWebhookEvent::hashBody($body);
        $h2 = SmoobuWebhookEvent::hashBody($body);

        $this->assertSame($h1, $h2);
    }

    public function test_hash_is_64_char_sha256_hex(): void
    {
        // Contract on the output format. The DB column is
        // string(64) — a regression that returned base64 or
        // base16 with prefix bytes would break the column write.
        $hash = SmoobuWebhookEvent::hashBody(['action' => 'created']);

        $this->assertSame(64, strlen($hash));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $hash);
    }

    public function test_assoc_key_order_does_not_affect_hash(): void
    {
        // THE load-bearing dedup property. Same keys + same values,
        // different declaration order → same hash. Without this,
        // Smoobu redelivering with different internal key order
        // would land as a new row and re-trigger every side effect
        // (booking write, email, audit log).
        $body1 = ['action' => 'created', 'reservationId' => 99];
        $body2 = ['reservationId' => 99, 'action' => 'created'];

        $this->assertSame(
            SmoobuWebhookEvent::hashBody($body1),
            SmoobuWebhookEvent::hashBody($body2),
        );
    }

    public function test_nested_assoc_key_order_does_not_affect_hash(): void
    {
        // Recursive canonicalisation: nested objects also get
        // ksorted. Without recursion, a nested body would be
        // reordering-sensitive even if the top level was stable.
        $body1 = ['action' => 'created', 'data' => ['a' => 1, 'b' => 2, 'c' => 3]];
        $body2 = ['action' => 'created', 'data' => ['c' => 3, 'a' => 1, 'b' => 2]];

        $this->assertSame(
            SmoobuWebhookEvent::hashBody($body1),
            SmoobuWebhookEvent::hashBody($body2),
        );
    }

    public function test_list_array_order_DOES_affect_hash(): void
    {
        // The semantic counterpart: numeric-key arrays are LISTS,
        // and list order matters. ['a', 'b'] is NOT the same body
        // as ['b', 'a'] — could mean different guest names or
        // different attached rooms. canonicalise() must NOT ksort
        // numeric-key arrays.
        $h1 = SmoobuWebhookEvent::hashBody(['guests' => ['Alice', 'Bob']]);
        $h2 = SmoobuWebhookEvent::hashBody(['guests' => ['Bob', 'Alice']]);

        $this->assertNotSame($h1, $h2,
            'List-array order changes must produce different hashes — order is semantic for lists.');
    }

    public function test_different_action_values_produce_different_hashes(): void
    {
        // Two bodies that share every key but differ on one value
        // must produce different hashes. Catches the failure mode
        // where canonicalise() somehow drops values along with
        // sorting keys.
        $h1 = SmoobuWebhookEvent::hashBody(['action' => 'created']);
        $h2 = SmoobuWebhookEvent::hashBody(['action' => 'updated']);

        $this->assertNotSame($h1, $h2);
    }

    public function test_empty_body_produces_a_stable_hash(): void
    {
        // Defensive: an empty webhook body must still hash
        // deterministically. Two empty deliveries shouldn't trigger
        // two separate side-effect cycles either.
        $h1 = SmoobuWebhookEvent::hashBody([]);
        $h2 = SmoobuWebhookEvent::hashBody([]);

        $this->assertSame($h1, $h2);
        $this->assertSame(64, strlen($h1));
    }

    public function test_unicode_values_are_preserved_not_double_escaped(): void
    {
        // JSON_UNESCAPED_UNICODE on json_encode keeps UTF-8 verbatim.
        // A guest name like "Łucja" must hash the same when the
        // body arrives with raw UTF-8 bytes as when it arrives
        // re-encoded by a SDK that defaults to \u escapes.
        $body = ['guestName' => 'Łucja Kowalska'];

        $hash = SmoobuWebhookEvent::hashBody($body);

        // Verify the hash matches the manual canonical form (raw UTF-8).
        $expected = hash('sha256', json_encode(
            $body,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        ));
        $this->assertSame($expected, $hash);
    }

    public function test_forward_slashes_in_urls_are_preserved(): void
    {
        // JSON_UNESCAPED_SLASHES keeps URLs verbatim. The default
        // json_encode emits `\/` which would change the hash
        // depending on whether the body went through any
        // intermediary that re-encoded. Hashing the unescaped form
        // is stable.
        $body = ['avatarUrl' => 'https://login.smoobu.com/images/x.jpg'];

        $hash = SmoobuWebhookEvent::hashBody($body);

        $expected = hash('sha256', json_encode(
            $body,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        ));
        $this->assertSame($expected, $hash);
    }

    public function test_real_smoobu_shape_round_trip(): void
    {
        // Sanity check against a representative real Smoobu webhook
        // payload (per docs.smoobu.com — `action` + `data` envelope
        // with the reservation embedded). Order-shuffled version
        // must produce the same hash.
        $original = [
            'action' => 'newReservation',
            'data' => [
                'id'             => 12345,
                'apartmentId'    => 67890,
                'firstName'      => 'Jan',
                'lastName'       => 'Kowalski',
                'arrivalDate'    => '2026-07-01',
                'departureDate'  => '2026-07-04',
                'channelId'      => 70,
                'price'          => 540.00,
                'priceStatus'    => 1,
                'email'          => 'jan@example.test',
            ],
        ];

        $shuffled = [
            'data' => [
                'price'          => 540.00,
                'lastName'       => 'Kowalski',
                'channelId'      => 70,
                'arrivalDate'    => '2026-07-01',
                'apartmentId'    => 67890,
                'id'             => 12345,
                'email'          => 'jan@example.test',
                'departureDate'  => '2026-07-04',
                'priceStatus'    => 1,
                'firstName'      => 'Jan',
            ],
            'action' => 'newReservation',
        ];

        $this->assertSame(
            SmoobuWebhookEvent::hashBody($original),
            SmoobuWebhookEvent::hashBody($shuffled),
            'Real-shape Smoobu webhook payload must dedup across key reordering at every level.',
        );
    }

    public function test_changing_a_nested_value_changes_the_hash(): void
    {
        // Round-trip on the change-detection side: tweaking a single
        // nested field must surface as a different hash so a legit
        // update from Smoobu IS processed as a new event.
        $base = ['data' => ['priceStatus' => 0, 'price' => 540.00]];
        $paid = ['data' => ['priceStatus' => 1, 'price' => 540.00]];

        $this->assertNotSame(
            SmoobuWebhookEvent::hashBody($base),
            SmoobuWebhookEvent::hashBody($paid),
            'A genuine field change must yield a different hash so the update is not deduped.',
        );
    }

    public function test_list_inside_assoc_keeps_order_while_outer_keys_sort(): void
    {
        // Mixed-shape body: outer object's keys can be reordered
        // (no impact), but the list array values must keep their
        // index order (impact). Exercises the assoc-vs-list detection
        // branch.
        $body1 = [
            'action' => 'updated',
            'guestIds' => [1, 2, 3],
        ];
        // Outer-keys swap → must hash the same.
        $body1Reordered = [
            'guestIds' => [1, 2, 3],
            'action' => 'updated',
        ];
        // List reorder → must hash differently.
        $body1ListShuffled = [
            'action' => 'updated',
            'guestIds' => [3, 1, 2],
        ];

        $this->assertSame(
            SmoobuWebhookEvent::hashBody($body1),
            SmoobuWebhookEvent::hashBody($body1Reordered),
        );
        $this->assertNotSame(
            SmoobuWebhookEvent::hashBody($body1),
            SmoobuWebhookEvent::hashBody($body1ListShuffled),
        );
    }
}
