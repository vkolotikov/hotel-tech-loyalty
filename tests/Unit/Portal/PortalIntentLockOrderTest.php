<?php

namespace Tests\Unit\Portal;

use PHPUnit\Framework\TestCase;

/**
 * Final review, Important 2: two concurrent confirms carrying the SAME
 * PaymentIntent — one with `master_id: null` (lock key `svc:…`), one naming
 * a master (`svcm:…`) — hold different slot locks, so both used to pass
 * `assertUnused()` before either committed and both wrote a booking. The fix
 * is a second advisory lock on the intent id itself, taken inside the
 * confirm transaction BEFORE `assertUnused()` reads the table.
 *
 * Why this test is structural (it reads the controller's source rather than
 * driving two requests): the suite runs on in-memory sqlite, where
 * `pg_advisory_xact_lock` never runs (AdvisoryLock issues nothing there) and
 * two requests cannot interleave inside one PHP process, so no behavioural
 * test here can tell "lock, then check" from "check, then lock" — or from no
 * lock at all. What CAN be pinned is the order of the two calls in
 * `writeBooking()`, which is the whole of the fix. The same approach as the
 * frontend's `tokens.test.ts`.
 */
class PortalIntentLockOrderTest extends TestCase
{
    public function test_write_booking_locks_the_intent_before_checking_it_is_unused(): void
    {
        $source = file_get_contents(dirname(__DIR__, 3) . '/app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php');
        $this->assertIsString($source);

        $start = strpos($source, 'private function writeBooking(');
        $this->assertNotFalse($start, 'writeBooking() not found');
        // The method body runs to the next method declaration.
        $end = strpos($source, "\n    protected function ", $start + 1);
        $nextPrivate = strpos($source, "\n    private function ", $start + 1);
        $end = min(array_filter([$end, $nextPrivate, strlen($source)], fn ($p) => $p !== false));
        $body = substr($source, $start, $end - $start);

        $lock = strpos($body, "AdvisoryLock::within('pi:'");
        $check = strpos($body, 'assertUnused(');
        $this->assertNotFalse($lock, "writeBooking() must take AdvisoryLock::within('pi:' . \$piId)");
        $this->assertNotFalse($check, 'writeBooking() must still call assertUnused()');
        $this->assertLessThan($check, $lock, 'the intent lock must be taken before assertUnused() reads the bookings table');
    }
}
